import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'http://localhost:3000';
const DATABASE = 'sentinelgraph-demo';

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

function runCli(args: string[]): string {
  const result = spawnSync(resolveSpacetimeCli(), args, {
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
    '--server', HOST,
    DATABASE,
    query,
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

export function resetDemo() {
  runSql(
    "UPDATE Incident SET risk_score = 0, status = 'Investigating', severity = 'High', classification = 'Pending Analysis', summary = '', trigger_details = '', blast_radius = 0, confidence = 0, impact_summary = '', recommendations = '[]' WHERE id = 1",
  );
  runSql('DELETE FROM Asset WHERE incident_id = 1');
  runSql('DELETE FROM Relationship WHERE incident_id = 1');

  const incident = runSql(
    'SELECT id, risk_score, status, classification, blast_radius, confidence FROM Incident WHERE id = 1',
  );
  const assets = runSql('SELECT id FROM Asset WHERE incident_id = 1');
  const relationships = runSql('SELECT id FROM Relationship WHERE incident_id = 1');

  if (incident.length !== 1) throw new Error('Incident #1 was not found after reset.');
  const row = incident[0];
  if (Number(row[1]) !== 0) throw new Error(`Incident #1 risk_score is ${row[1]}, expected 0.`);
  if (String(row[2]) !== 'Investigating') throw new Error(`Incident #1 status is ${row[2]}, expected Investigating.`);
  if (assets.length !== 0) throw new Error(`Expected 0 Asset rows, found ${assets.length}.`);
  if (relationships.length !== 0) throw new Error(`Expected 0 Relationship rows, found ${relationships.length}.`);

  console.log('✅ Incident #1 reset to clean state. Ready for demo run.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  resetDemo();
}
