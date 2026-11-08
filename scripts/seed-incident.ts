import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_URI || 'http://localhost:3000';
const DATABASE = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE || 'sentinelgraph-demo';
const DEMO_NOTES = [
  'Spike in egress traffic detected via VPC Flow Logs toward external endpoint.',
  'IAM Role assume event triggered without corresponding JIRA approval ticket.',
];

const DEMO_INCIDENTS = [
  {
    title: 'Unusual Bulk Data Access & Exfiltration Attempt',
    description: 'Exfiltration burst: 84.2 GB queried via svc-prod-data-pipeline to a staging S3 bucket outside core business hours (02:14 UTC).',
    subjectName: 'svc-prod-data-pipeline',
    severity: 'Critical',
    riskScore: 94,
    owner: 'alex.rivera',
    initialNote: 'Initial detection: anomalous bulk data access and external staging activity.',
  },
  {
    title: 'Privileged Identity Abuse in Cloud Control Plane',
    description: 'A privileged IAM identity created unusual trust-policy changes and accessed production secrets outside an approved change window.',
    subjectName: 'aws-iam-admin',
    severity: 'High',
    riskScore: 82,
    owner: 'taylor.brooks',
    initialNote: 'Unapproved IAM trust-policy activity detected on the cloud control plane.',
  },
  {
    title: 'Suspicious Financial Data Collection',
    description: 'Multiple restricted finance documents were collected from a corporate endpoint shortly before an unusual authentication event.',
    subjectName: 'corp-laptop-finance',
    severity: 'High',
    riskScore: 76,
    owner: 'alex.rivera',
    initialNote: 'Restricted finance-share collection identified from an employee endpoint.',
  },
  {
    title: 'Endpoint Canary Signal and Ransomware Indicators',
    description: 'A corporate endpoint triggered a ransomware canary after rapid file renaming and defensive-tool activity.',
    subjectName: 'taylor.brooks',
    severity: 'Critical',
    riskScore: 91,
    owner: 'administrator',
    initialNote: 'Ransomware canary triggered; endpoint containment review is required.',
  },
  {
    title: 'Off-hours Account Authentication Review',
    description: 'An employee account authenticated from a new location without confirmed travel or a matching approved access request.',
    subjectName: 'employee-access-review',
    severity: 'Medium',
    riskScore: 58,
    owner: 'administrator',
    initialNote: 'Off-hours authentication requires identity verification before escalation.',
  },
] as const;

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
  let primaryIncidentId: bigint | null = null;

  for (const demo of DEMO_INCIDENTS) {
    const titleSql = escapeSql(demo.title);
    const existingRows = getSqlRows(
      `SELECT id FROM Incident WHERE title = '${titleSql}' LIMIT 1`,
    );

    let incidentId: bigint;
    if (existingRows.length > 0) {
      incidentId = BigInt(String(existingRows[0][0]));
      console.log(`✓ Demo incident already exists (id: ${incidentId}): "${demo.title}"`);
    } else {
      callReducer('create_incident', [
        demo.title,
        demo.description,
        demo.severity,
        demo.initialNote,
      ]);

      const insertedRows = getSqlRows(
        `SELECT id FROM Incident WHERE title = '${titleSql}' LIMIT 1`,
      );
      if (insertedRows.length === 0) {
        throw new Error(`Incident reducer completed but "${demo.title}" was not found.`);
      }
      incidentId = BigInt(String(insertedRows[0][0]));
      console.log(`✓ Seeded incident "${demo.title}" (id: ${incidentId}).`);
    }

    runSql(
      `UPDATE Incident SET subject_name = '${escapeSql(demo.subjectName)}', severity = '${demo.severity}', status = 'Investigating', risk_score = ${demo.riskScore}, owner = '${demo.owner}', assigned_to = '${demo.owner}' WHERE id = ${incidentId.toString()}`,
    );

    if (demo.title === DEMO_INCIDENTS[0].title) {
      primaryIncidentId = incidentId;
    }
  }

  if (primaryIncidentId) {
    const existingNotes = getSqlRows(
      `SELECT content FROM InvestigationNote WHERE incident_id = ${primaryIncidentId.toString()}`,
    ).map(row => String(row[0]));

    for (const content of DEMO_NOTES) {
      if (existingNotes.includes(content)) {
        console.log(`✓ Investigation note already exists: "${content}"`);
        continue;
      }

      callReducer('add_investigation_note', [primaryIncidentId, content]);
      console.log(`✓ Added investigation note: "${content}"`);
    }
  }

  console.log('✅ SentinelGraph demo seed completed successfully.');
}

seedIncident().catch(error => {
  console.error('❌ Seed failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});