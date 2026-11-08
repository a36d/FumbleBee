import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const HOST = 'http://127.0.0.1:3000';
const DATABASE = 'sentinelgraph';

function resolveSpacetimeCli(): string {
  const candidates = [
    process.env.SPACETIME_CLI,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'SpacetimeDB', 'spacetime.exe') : undefined,
    join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'spacetime.exe'),
    join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'spacetime'),
    'spacetime',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate === 'spacetime' || existsSync(candidate)) return candidate;
  }
  throw new Error('SpacetimeDB CLI not found. Install it or set SPACETIME_CLI.');
}

const cli = resolveSpacetimeCli();

function runCli(args: string[]): string {
  const result = spawnSync(cli, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `SpacetimeDB CLI exited with ${result.status}`);
  }
  return result.stdout.trim();
}

function runSql(query: string): unknown[][] {
  const output = runCli([
    'sql',
    DATABASE,
    query,
    '--server', HOST,
    '--format', 'json',
    '--yes',
  ]);
  const payloadLine = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.startsWith('[{"schema"'));
  if (!payloadLine) return [];
  const payload = JSON.parse(payloadLine) as Array<{ rows?: unknown[][] }>;
  return payload[0]?.rows ?? [];
}

function callReducer(name: string, args: Array<string | number | bigint>): void {
  runCli([
    'call',
    DATABASE,
    name,
    ...args.map(value => typeof value === 'string' ? JSON.stringify(value) : String(value)),
    '--server', HOST,
    '--yes',
  ]);
}

async function verifyLiveSync() {
  console.log(`Querying ${DATABASE} at ${HOST}...`);

  const incidentBefore = runSql(
    'SELECT id, title, risk_score, classification, severity, blast_radius, confidence, impact_summary FROM Incident WHERE id = 1',
  );
  const assetsBefore = runSql('SELECT id FROM Asset WHERE incident_id = 1');
  const relationshipsBefore = runSql('SELECT id FROM Relationship WHERE incident_id = 1');

  console.log('Before analysis:');
  console.log(`  Incident #1: ${incidentBefore.length === 1 ? JSON.stringify(incidentBefore[0]) : 'not found'}`);
  console.log(`  Assets: ${assetsBefore.length}`);
  console.log(`  Relationships: ${relationshipsBefore.length}`);

  const assets = [
    {
      id: 'live-sync-service-account',
      name: 'svc-prod-data-pipeline',
      type: 'identity',
      description: 'Production service account with elevated IAM access.',
      riskLabel: 'High',
    },
    {
      id: 'live-sync-s3-buckets',
      name: 'Production S3 Buckets',
      type: 'share',
      description: 'Sensitive production object storage accessed outside normal hours.',
      riskLabel: 'Critical',
    },
  ];
  const edges = [
    {
      sourceId: 'live-sync-service-account',
      targetId: 'live-sync-s3-buckets',
      label: 'bulk accessed',
    },
  ];

  callReducer('apply_ai_analysis', [
    1n,
    'Potential Data Exfiltration',
    91,
    'Critical',
    2,
    95,
    'Live-sync verification detected anomalous service-account access to production object storage.',
    JSON.stringify([
      'Suspend the service account pending investigation.',
      'Review IAM trust-policy and S3 access history.',
    ]),
    JSON.stringify(assets),
    JSON.stringify(edges.map(edge => ({
      source: edge.sourceId,
      target: edge.targetId,
      relationLabel: edge.label,
    }))),
  ]);

  const incidentAfter = runSql(
    'SELECT id, title, risk_score, classification, severity, blast_radius, confidence, impact_summary FROM Incident WHERE id = 1',
  );
  const assetsAfter = runSql(
    'SELECT id, name, asset_type, risk_level FROM Asset WHERE incident_id = 1',
  );
  const relationshipsAfter = runSql(
    'SELECT id, source_asset_key, target_asset_key, relation_label FROM Relationship WHERE incident_id = 1',
  );

  console.log('\nAfter applyAiAnalysis:');
  console.log(`  Incident #1: ${incidentAfter.length === 1 ? JSON.stringify(incidentAfter[0]) : 'not found'}`);
  console.log(`  Assets: ${assetsAfter.length}`);
  console.log(`  Relationships: ${relationshipsAfter.length}`);

  if (incidentAfter.length !== 1) throw new Error('Incident #1 was not found after analysis.');
  const row = incidentAfter[0];
  const riskScore = Number(row[2]);
  const classification = String(row[3]);
  const severity = String(row[4]);
  const blastRadius = Number(row[5]);
  const confidence = Number(row[6]);

  if (riskScore !== 91) throw new Error(`Expected risk_score 91, received ${riskScore}.`);
  if (classification !== 'Potential Data Exfiltration') throw new Error(`Unexpected classification: ${classification}`);
  if (severity !== 'Critical') throw new Error(`Expected severity Critical, received ${severity}.`);
  if (blastRadius !== 2) throw new Error(`Expected blast_radius 2, received ${blastRadius}.`);
  if (confidence !== 95) throw new Error(`Expected confidence 95, received ${confidence}.`);
  if (assetsAfter.length <= assetsBefore.length) throw new Error('Asset rows were not added for Incident #1.');
  if (relationshipsAfter.length <= relationshipsBefore.length) throw new Error('Relationship rows were not added for Incident #1.');

  const hasLiveAssets = assetsAfter.some(assetRow => String(assetRow[1]) === 'svc-prod-data-pipeline' || String(assetRow[1]) === 'Production S3 Buckets');
  const hasLiveRelationship = relationshipsAfter.some(relRow =>
    String(relRow[1]) === 'live-sync-service-account'
    && String(relRow[2]) === 'live-sync-s3-buckets'
    && String(relRow[3]) === 'bulk accessed',
  );
  if (!hasLiveAssets) throw new Error('Expected live-sync Asset rows are missing.');
  if (!hasLiveRelationship) throw new Error('Expected live-sync Relationship row is missing.');

  console.log('\nAssets populated:');
  for (const asset of assetsAfter) console.log(`  - ${JSON.stringify(asset)}`);
  console.log('Relationships populated:');
  for (const relationship of relationshipsAfter) console.log(`  - ${JSON.stringify(relationship)}`);
  console.log('\nLIVE SYNC VERIFICATION PASSED');
}

verifyLiveSync().catch(error => {
  console.error('LIVE SYNC VERIFICATION FAILED:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
