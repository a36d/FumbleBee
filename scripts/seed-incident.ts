import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_URI || 'http://localhost:3000';
const DATABASE = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE || 'sentinelgraph-demo';
const DEMO_TITLE = 'Unusual Bulk Data Access & Exfiltration Attempt';
const DEMO_NOTES = [
  'Spike in egress traffic detected via VPC Flow Logs toward external endpoint.',
  'IAM Role assume event triggered without corresponding JIRA approval ticket.',
];

function resolveSpacetimeCli(): string {
  const localAppData = process.env.LOCALAPPDATA;
  let versionedCli: string | undefined;

  // Check versioned directory if present (e.g., AppData/Local/SpacetimeDB/bin/2.14.1/spacetimedb-cli.exe)
  if (localAppData) {
    const binDir = join(localAppData, 'SpacetimeDB', 'bin');
    if (existsSync(binDir)) {
      try {
        const subdirs = readdirSync(binDir);
        for (const dir of subdirs) {
          const candidate = join(binDir, dir, 'spacetimedb-cli.exe');
          if (existsSync(candidate)) {
            versionedCli = candidate;
            break;
          }
        }
      } catch {
        // Fall back to general candidates
      }
    }
  }

  const candidates = [
    process.env.SPACETIME_CLI,
    versionedCli,
    localAppData ? join(localAppData, 'SpacetimeDB', 'bin', 'current', 'spacetimedb-cli.exe') : undefined,
    localAppData ? join(localAppData, 'SpacetimeDB', 'spacetime.exe') : undefined,
    join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'spacetime.exe'),
    join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'spacetime'),
    'spacetime',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate === 'spacetime' || existsSync(candidate)) return candidate;
  }
  throw new Error('SpacetimeDB CLI not found. Install it or set SPACETIME_CLI.');
}

const spacetimeCli = resolveSpacetimeCli();

function runCli(args: string[]) {
  const result = spawnSync(spacetimeCli, args, {
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

function runSql(query: string): unknown {
  const output = runCli([
    'sql',
    DATABASE,
    query,
    '--server', HOST,
    '--format', 'json',
    '--yes',
  ]);
  const lines = output.split(/\r?\n/).filter(line => line.trim().startsWith('['));
  const payload = lines.find(line => line.trim().startsWith('[{"schema"'));
  return payload ? JSON.parse(payload) : [];
}

function getSqlRows(query: string): unknown[][] {
  const result = runSql(query) as Array<{ rows?: unknown[][] }>;
  return result[0]?.rows ?? [];
}

function callReducer(name: string, args: Array<string | bigint | number>): void {
  const reducerNames: Record<string, string> = {
    createIncident: 'create_incident',
    addInvestigationNote: 'add_investigation_note',
  };
  const cliArgs = [
    'call',
    DATABASE,
    reducerNames[name] ?? name.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase(),
    ...args.map(value => (typeof value === 'string' ? JSON.stringify(value) : String(value))),
    '--server', HOST,
    '--yes',
  ];
  runCli(cliArgs);
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

async function seedIncident() {
  console.log(`Connecting to SpacetimeDB at ${HOST}, database "${DATABASE}"...`);

  const existingRows = getSqlRows(
    `SELECT id, title FROM Incident WHERE title = '${escapeSql(DEMO_TITLE)}'`,
  );

  let incidentId: bigint;
  if (existingRows.length > 0) {
    incidentId = BigInt(String(existingRows[0][0]));
    console.log(`✓ Primary demo incident already exists (id: ${incidentId}).`);
  } else {
    // Call the create_incident reducer directly via CLI
    // Matches the updated schema: title, description, subjectName, status, severity, owner, assignedTo
    // Matches the 4 expected arguments: title, description, severity, initialNotes
    callReducer('create_incident', [
      DEMO_TITLE,
      'Exfiltration burst: 84.2 GB queried via svc-prod-data-pipeline to staging S3 bucket outside core business hours (02:14 UTC). Staging bucket modified to public-read ACL.',
      'Critical',
      'Initial detection: anomalous burst from Morgan Chen / svc-prod-data-pipeline.',
    ]);

    const insertedRows = getSqlRows(
      `SELECT id FROM Incident WHERE title = '${escapeSql(DEMO_TITLE)}' LIMIT 1`,
    );
    if (insertedRows.length === 0) {
      throw new Error('Incident reducer completed but the incident was not found.');
    }
    incidentId = BigInt(String(insertedRows[0][0]));
    console.log(`✓ Seeded incident "${DEMO_TITLE}" (id: ${incidentId}).`);
  }

  const existingNotes = getSqlRows(
    `SELECT content FROM InvestigationNote WHERE incident_id = ${incidentId.toString()}`,
  ).map(row => String(row[0]));

  for (const content of DEMO_NOTES) {
    if (existingNotes.includes(content)) {
      console.log(`✓ Investigation note already exists: "${content}"`);
      continue;
    }

    callReducer('add_investigation_note', [incidentId, content]);
    console.log(`✓ Added investigation note: "${content}"`);
  }

  console.log('✅ SentinelGraph demo seed completed successfully.');
}

seedIncident().catch(error => {
  console.error('❌ Seed failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});