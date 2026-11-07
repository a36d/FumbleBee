export type SentinelRole = 'admin' | 'investigator' | 'viewer';

export interface User {
  identity: string;
  name: string;
  email: string;
  role: SentinelRole;
  createdAt: unknown;
}

export interface Incident {
  id: bigint;
  title: string;
  description: string;
  subjectName: string;
  status: string;
  severity: string;
  riskScore: number;
  classification: string;
  summary: string;
  createdBy: string;
  createdAt: unknown;
}

export interface InvestigationNote {
  id: bigint;
  incidentId: bigint;
  authorIdentity: string;
  authorName: string;
  content: string;
  createdAt: unknown;
}

export interface ActivityFeedEntry {
  id: bigint;
  incidentId: bigint;
  actorName: string;
  action: string;
  createdAt: unknown;
}

export interface Asset {
  id: bigint;
  incidentId: bigint;
  assetKey: string;
  name: string;
  assetType: string;
  riskLevel: string;
}

export interface Relationship {
  id: bigint;
  incidentId: bigint;
  sourceAssetKey: string;
  targetAssetKey: string;
  relationLabel: string;
}

export interface AuditLogEntry {
  sequenceId: bigint;
  action: string;
  actorIdentity: string;
  incidentId: bigint | null;
  timestamp: unknown;
  previousHash: string;
  currentHash: string;
}

export interface AttackGraphEdge {
  source: string;
  target: string;
  relationLabel: string;
}

export interface AiAnalysisInput {
  classification: string;
  riskScore: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  blastRadius: number;
  confidence: number;
  summary: string;
  affectedAssets: string[];
  attackGraphEdges: AttackGraphEdge[];
  recommendations: string[];
}

export interface ReducerInvoker {
  call(name: string, args: Record<string, unknown>): void | Promise<void>;
}

export interface SentinelGraphTransport {
  reducer?: ReducerInvoker;
  subscribe?: (
    tables: Array<'User' | 'Incident' | 'Asset' | 'Relationship' | 'InvestigationNote' | 'ActivityFeed' | 'AuditLog'>,
    listener: () => void,
  ) => () => void;
}

export interface SentinelGraphClientOptions {
  host: string;
  databaseName: string;
  token?: string;
  transport: SentinelGraphTransport;
}

export class SentinelGraphClient {
  constructor(public readonly options: SentinelGraphClientOptions) {}

  private call(name: string, args: Record<string, unknown>): void | Promise<void> {
    if (!this.options.transport.reducer) {
      throw new Error('A SpacetimeDB reducer invoker is required');
    }
    return this.options.transport.reducer.call(name, args);
}

  createIncident(input: { title: string; description: string; subjectName: string; status?: string; severity?: string }) {
    return this.call('createIncident', {
      title: input.title,
      description: input.description,
      subjectName: input.subjectName,
      status: input.status ?? 'Open',
      severity: input.severity ?? 'Medium',
    });
  }

  updateIncident(input: {
    id: bigint; title: string; description: string; subjectName: string; status: string;
    severity: string; riskScore: number; classification: string; summary: string;
  }) {
    return this.call('updateIncident', input);
  }

  addInvestigationNote(incidentId: bigint, content: string) {
    return this.call('addInvestigationNote', { incidentId, content });
  }

  applyAiAnalysis(incidentId: bigint, analysis: AiAnalysisInput) {
    return this.call('applyAiAnalysis', { incidentId, ...analysis });
  }

  createUser(identity: string, name: string, email: string, role: SentinelRole) {
    return this.call('createUser', { identity, name, email, role });
  }

  setUserRole(identity: string, role: SentinelRole) {
    return this.call('setUserRole', { identity, role });
  }

  deleteUser(identity: string) {
    return this.call('deleteUser', { identity });
  }

  subscribe(
    listener: () => void,
    tables: Parameters<NonNullable<SentinelGraphTransport['subscribe']>>[0] = [
      'Incident', 'Asset', 'Relationship', 'InvestigationNote', 'ActivityFeed', 'AuditLog',
    ],
  ): () => void {
    if (!this.options.transport.subscribe) return () => undefined;
    return this.options.transport.subscribe(tables, listener);
  }
}

export function createSentinelGraphClient(options: SentinelGraphClientOptions) {
  return new SentinelGraphClient(options);
}
