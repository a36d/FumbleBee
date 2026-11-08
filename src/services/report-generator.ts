import { createHash } from 'node:crypto';
import {
  DbConnection,
  tables,
} from '../generated/spacetimedb';
import type {
  Asset,
  AuditLog,
  Incident,
  InvestigationNote,
  Relationship,
} from '../generated/spacetimedb/types';

export interface ForensicAuditEntry {
  sequenceId: string;
  action: string;
  actorIdentity: string;
  timestamp: string;
  previousHash: string;
  currentHash: string;
}

export interface IncidentForensicReport {
  reportVersion: '1.0';
  incidentId: string;
  generatedAt: string;
  executiveSummary: {
    title: string;
    description: string;
    subjectName: string;
    status: string;
    severity: string;
    riskScore: number;
    classification: string;
    blastRadius: number;
    confidence: number;
    impactSummary: string;
    recommendations: string[];
  };
  scopeAssessment: {
    exfiltrated: string[];
    ransomwareEncrypted: string[];
    quarantined: string[];
    atRisk: string[];
  };
  investigationTimeline: Array<{
    sequence: number;
    timestamp: string;
    author: string;
    action: string;
  }>;
  attestationAuditTrail: ForensicAuditEntry[];
  relationships: Array<{
    id: string;
    sourceAssetKey: string;
    targetAssetKey: string;
    relationLabel: string;
  }>;
  cryptographicIntegrity: {
    valid: boolean;
    algorithm: 'SHA-256';
    rootHash: string;
    auditedEntries: number;
    verifiedEntries: number;
    errors: string[];
  };
}

interface TimestampLike {
  microsSinceUnixEpoch?: bigint;
  micros?: bigint;
}

function formatTimestamp(value: TimestampLike | string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const micros = value.microsSinceUnixEpoch ?? value.micros;
  if (typeof micros === 'bigint') {
    return new Date(Number(micros / 1000n)).toISOString();
  }
  return '';
}

function identityHex(identity: unknown): string {
  if (typeof identity === 'string') return identity;
  if (identity && typeof (identity as { toHexString?: () => string }).toHexString === 'function') {
    return (identity as { toHexString: () => string }).toHexString();
  }
  return String(identity ?? '');
}

function optionBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (value && typeof value === 'object' && 'some' in value) {
    const some = (value as { some?: unknown }).some;
    if (typeof some === 'bigint') return some;
    if (typeof some === 'number') return BigInt(some);
  }
  return null;
}

function parseRecommendations(value: string): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalTimestampMicros(value: TimestampLike | null | undefined): string {
  if (!value) return '0';
  return String(value.microsSinceUnixEpoch ?? value.micros ?? 0n);
}

async function readDatabaseSnapshot(timeoutMs = 15000): Promise<{
  incidents: Incident[];
  notes: InvestigationNote[];
  assets: Asset[];
  relationships: Relationship[];
  auditLogs: AuditLog[];
}> {
  return new Promise((resolve, reject) => {
    let connection: DbConnection | null = null;
    const timer = setTimeout(() => {
      connection?.disconnect();
      reject(new Error('Timed out connecting to SpacetimeDB sentinelgraph.'));
    }, timeoutMs);

    connection = DbConnection.builder()
      .withUri(process.env.SPACETIME_DB_HOST ?? 'http://127.0.0.1:3000')
      .withDatabaseName(process.env.SPACETIME_DB_NAME ?? 'sentinelgraph')
      .onConnect((connected) => {
        connected.subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            const snapshot = {
              incidents: Array.from(connected.db.incident.iter()) as Incident[],
              notes: Array.from(connected.db.investigationNote.iter()) as InvestigationNote[],
              assets: Array.from(connected.db.asset.iter()) as Asset[],
              relationships: Array.from(connected.db.relationship.iter()) as Relationship[],
              auditLogs: Array.from(connected.db.auditLog.iter()) as AuditLog[],
            };
            connected.disconnect();
            resolve(snapshot);
          })
          .onError((error) => {
            clearTimeout(timer);
            connected.disconnect();
            reject(error instanceof Error ? error : new Error(String(error)));
          })
          .subscribe([
            tables.incident,
            tables.investigationNote,
            tables.asset,
            tables.relationship,
            tables.auditLog,
          ]);
      })
      .onDisconnect(() => undefined)
      .build();
  });
}

export async function generateIncidentReport(incidentId: bigint): Promise<IncidentForensicReport> {
  if (incidentId < 1n) throw new Error('Incident ID must be positive.');
  const snapshot = await readDatabaseSnapshot();
  const incident = snapshot.incidents.find(row => row.id === incidentId);
  if (!incident) throw new Error(`Incident #${incidentId} was not found.`);

  const assets = snapshot.assets.filter(row => row.incidentId === incidentId);
  const relationships = snapshot.relationships.filter(row => row.incidentId === incidentId);
  const notes = snapshot.notes
    .filter(row => row.incidentId === incidentId)
    .sort((a, b) => {
      const left = canonicalTimestampMicros(a.createdAt);
      const right = canonicalTimestampMicros(b.createdAt);
      return left.localeCompare(right, undefined, { numeric: true }) || a.id.toString().localeCompare(b.id.toString(), undefined, { numeric: true });
    });

  const scopeAssessment = {
    exfiltrated: [] as string[],
    ransomwareEncrypted: [] as string[],
    quarantined: [] as string[],
    atRisk: [] as string[],
  };
  for (const asset of assets) {
    const status = (asset.compromiseStatus || 'targeted').toLowerCase();
    const label = `${asset.name} (${asset.assetKey || asset.id.toString()})`;
    if (status === 'data_exfiltrated') scopeAssessment.exfiltrated.push(label);
    else if (status === 'ransomware_encrypted') scopeAssessment.ransomwareEncrypted.push(label);
    else if (status === 'quarantined') scopeAssessment.quarantined.push(label);
    else scopeAssessment.atRisk.push(label);
  }

  const sortedAuditLog = [...snapshot.auditLogs].sort((a, b) => {
    return a.sequenceId < b.sequenceId ? -1 : a.sequenceId > b.sequenceId ? 1 : 0;
  });

  const integrityErrors: string[] = [];
  let rootHash = sha256('SENTINELGRAPH-AUDIT-CHAIN-GENESIS');
  let verifiedEntries = 0;
  let previousCurrentHash: string | null = null;
  for (const row of sortedAuditLog) {
    const timestampMicros = canonicalTimestampMicros(row.timestamp);
    const actor = identityHex(row.actorIdentity);
    const recalculatedHash = sha256(row.action + actor + timestampMicros + row.previousHash);

    if (recalculatedHash !== row.currentHash) {
      integrityErrors.push(`Sequence ${row.sequenceId.toString()}: SHA-256 payload mismatch`);
    }
    if (previousCurrentHash !== null && row.previousHash !== previousCurrentHash) {
      integrityErrors.push(`Sequence ${row.sequenceId.toString()}: previousHash chain mismatch`);
    }

    if (recalculatedHash === row.currentHash && (previousCurrentHash === null || row.previousHash === previousCurrentHash)) {
      verifiedEntries += 1;
    }
    rootHash = sha256(`${rootHash}:${row.currentHash}:${row.sequenceId.toString()}`);
    previousCurrentHash = row.currentHash;
  }

  const incidentAuditLogs = sortedAuditLog.filter(row => optionBigInt(row.incidentId) === incidentId);
  const attestationAuditTrail = incidentAuditLogs.map(row => ({
    sequenceId: row.sequenceId.toString(),
    action: row.action,
    actorIdentity: identityHex(row.actorIdentity),
    timestamp: formatTimestamp(row.timestamp),
    previousHash: row.previousHash,
    currentHash: row.currentHash,
  }));

  const investigationTimeline = [
    {
      sequence: 0,
      timestamp: formatTimestamp(incident.createdAt),
      author: 'System',
      action: `Incident opened: ${incident.title}`,
    },
    ...notes.map((note, index) => ({
      sequence: index + 1,
      timestamp: formatTimestamp(note.createdAt),
      author: note.authorName,
      action: note.content,
    })),
  ];

  return {
    reportVersion: '1.0',
    incidentId: incidentId.toString(),
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      title: incident.title,
      description: incident.description,
      subjectName: incident.subjectName,
      status: incident.status,
      severity: incident.severity,
      riskScore: Number(incident.riskScore),
      classification: incident.classification,
      blastRadius: Number(incident.blastRadius),
      confidence: Number(incident.confidence),
      impactSummary: incident.impactSummary || incident.summary || '',
      recommendations: parseRecommendations(incident.recommendations),
    },
    scopeAssessment,
    investigationTimeline,
    attestationAuditTrail,
    relationships: relationships.map(row => ({
      id: row.id.toString(),
      sourceAssetKey: row.sourceAssetKey,
      targetAssetKey: row.targetAssetKey,
      relationLabel: row.relationLabel,
    })),
    cryptographicIntegrity: {
      valid: integrityErrors.length === 0,
      algorithm: 'SHA-256',
      rootHash,
      auditedEntries: sortedAuditLog.length,
      verifiedEntries,
      errors: integrityErrors,
    },
  };
}

function markdownList(items: string[]): string {
  return items.length > 0 ? items.map(item => `- ${item}`).join('\n') : '- None identified';
}

export function reportToMarkdown(report: IncidentForensicReport): string {
  const summary = report.executiveSummary;
  const lines = [
    `# Incident #${report.incidentId} Forensic Report`,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Executive Summary & Classification',
    '',
    `- **Title:** ${summary.title}`,
    `- **Subject:** ${summary.subjectName}`,
    `- **Status:** ${summary.status}`,
    `- **Severity:** ${summary.severity}`,
    `- **Risk Score:** ${summary.riskScore}/100`,
    `- **Classification:** ${summary.classification}`,
    `- **Blast Radius:** ${summary.blastRadius}`,
    `- **Confidence:** ${summary.confidence}%`,
    '',
    summary.description,
    '',
    '### Impact Summary',
    '',
    summary.impactSummary || 'No impact summary available.',
    '',
    '### Recommendations',
    '',
    markdownList(summary.recommendations),
    '',
    '## Scope Assessment',
    '',
    '### Exfiltrated',
    markdownList(report.scopeAssessment.exfiltrated),
    '',
    '### Ransomware Encrypted',
    markdownList(report.scopeAssessment.ransomwareEncrypted),
    '',
    '### Quarantined',
    markdownList(report.scopeAssessment.quarantined),
    '',
    '### At-Risk',
    markdownList(report.scopeAssessment.atRisk),
    '',
    '## Investigation Timeline',
    '',
  ];
  for (const event of report.investigationTimeline) {
    lines.push(`- **${event.timestamp || 'Unknown time'}** — ${event.author}: ${event.action}`);
  }
  lines.push(
    '',
    '## Complete Attestation & Audit Trail',
    '',
  );

  if (report.attestationAuditTrail.length === 0) {
    lines.push('No incident-specific audit entries were recorded.');
  } else {
    for (const entry of report.attestationAuditTrail) {
      lines.push(
        `### Sequence ${entry.sequenceId}`,
        '',
        `- **Timestamp:** ${entry.timestamp}`,
        `- **Actor:** ${entry.actorIdentity}`,
        `- **Action:** ${entry.action}`,
        `- **Previous Hash:** \`${entry.previousHash}\``,
        `- **SHA-256:** \`${entry.currentHash}\``,
        '',
      );
    }
  }

  lines.push(
    '## Cryptographic Integrity Check',
    '',
    `- **Valid:** ${report.cryptographicIntegrity.valid ? 'YES' : 'NO'}`,
    `- **Algorithm:** ${report.cryptographicIntegrity.algorithm}`,
    `- **Audited Entries:** ${report.cryptographicIntegrity.auditedEntries}`,
    `- **Verified Entries:** ${report.cryptographicIntegrity.verifiedEntries}`,
    `- **Root Hash:** \`${report.cryptographicIntegrity.rootHash}\``,
  );
  if (report.cryptographicIntegrity.errors.length > 0) {
    lines.push('', '### Integrity Errors', ...report.cryptographicIntegrity.errors.map(error => `- ${error}`));
  }
  return `${lines.join('\n')}\n`;
}
