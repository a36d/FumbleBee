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
  triggerDetails: string;
  blastRadius: number;
  confidence: number;
  impactSummary: string;
  recommendations: string[];
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
  id: IdLike;
  incidentId?: bigint | number | string;
  assetKey?: string;
  name: string;
  assetType?: string;
  riskLevel?: string;
  type?: string;
  riskLabel?: string;
  description?: string;
}

export interface Relationship {
  id?: bigint | number | string;
  incidentId?: bigint | number | string;
  sourceAssetKey?: string;
  targetAssetKey?: string;
  relationLabel?: string;
  sourceId?: string;
  targetId?: string;
  source?: string;
  target?: string;
  label?: string;
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

export interface AttackGraphAsset {
  id: string;
  name: string;
  type: 'identity' | 'share' | 'database' | 'resource';
  description: string;
  riskLabel: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface AttackGraphFrontendEdge {
  sourceId: string;
  targetId: string;
  label: string;
}

export interface AiAnalysisInput {
  threatClassification: string;
  riskScore: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  blastRadius: number;
  confidence: number;
  impactSummary: string;
  recommendations: string[];
  assets: AttackGraphAsset[];
  edges: AttackGraphFrontendEdge[];
}

export type FrontendSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type FrontendIncidentStatus = 'Investigating' | 'In review' | 'Contained' | 'Closed';
export type FrontendAssetType = 'identity' | 'share' | 'database' | 'resource';
export type FrontendRiskLabel = FrontendSeverity;

export interface FrontendIncident {
  id: string;
  subjectName: string;
  title: string;
  description: string;
  triggerDetails: string;
  severity: FrontendSeverity;
  riskScore: number;
  status: FrontendIncidentStatus | string;
  createdAt: string;
  threatClassification: string;
  blastRadius: number;
  impactSummary: string;
  recommendations: string[];
  confidence: number;
}

export interface FrontendAsset {
  id: string;
  name: string;
  type: FrontendAssetType | string;
  description: string;
  riskLabel: FrontendRiskLabel | string;
}

export interface FrontendRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
}

export interface FrontendInvestigationNote {
  id: string;
  incidentId: string;
  author: string;
  initials: string;
  content: string;
  createdAt: string;
}

export interface FrontendActivityFeed {
  id: string;
  incidentId: string;
  action: string;
  actor: string;
  createdAt: string;
  kind: 'incident' | 'note' | 'analysis' | 'risk' | 'graph';
}

export interface FrontendAuditLog {
  id: string;
  sequence: number;
  action: string;
  actor: string;
  timestamp: string;
  previousHash: string;
  currentHash: string;
}

export interface ReactFlowNode {
  id: string;
  data: { asset: FrontendAsset };
  position: { x: number; y: number };
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

type IdLike = bigint | number | string | { toString(): string };
interface TimestampLike {
  microsSinceUnixEpoch?: bigint;
  micros?: bigint;
  toISOString?: () => string;
  toMillis?: () => bigint;
}
interface IdentityLike {
  toHexString?: () => string;
  toString?: () => string;
}

function stringifyId(value: IdLike | null | undefined): string {
  return value == null ? '' : value.toString();
}

export function formatTimestamp(timestamp: TimestampLike | string | Date | null | undefined): string {
  if (!timestamp) return '';
  if (typeof timestamp === 'string') return timestamp;
  if (timestamp instanceof Date) return timestamp.toISOString();
  if (typeof timestamp.toISOString === 'function') return timestamp.toISOString();

  const micros = timestamp.microsSinceUnixEpoch ?? timestamp.micros;
  if (typeof micros === 'bigint') {
    return new Date(Number(micros / 1000n)).toISOString();
  }
  if (typeof timestamp.toMillis === 'function') {
    return new Date(Number(timestamp.toMillis())).toISOString();
  }
  return '';
}

export function formatIdentity(identity: IdentityLike | string | null | undefined): string {
  if (!identity) return '';
  if (typeof identity === 'string') return identity;
  if (typeof identity.toHexString === 'function') return identity.toHexString();
  return identity.toString?.() ?? '';
}

export function parseRecommendations(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function formatIncident(
  incident: {
    id: IdLike;
    title?: string;
    description?: string;
    subjectName?: string;
    triggerDetails?: string;
    severity?: string;
    riskScore?: number;
    status?: string;
    classification?: string;
    threatClassification?: string;
    blastRadius?: number;
    confidence?: number;
    summary?: string;
    impactSummary?: string;
    recommendations?: string | string[];
    createdAt?: TimestampLike | string | Date;
  },
): FrontendIncident {
  const classification = incident.threatClassification ?? incident.classification;
  const impactSummary = incident.impactSummary ?? incident.summary;
  const severity = incident.severity === 'Critical' || incident.severity === 'High' ||
    incident.severity === 'Medium' || incident.severity === 'Low'
    ? incident.severity
    : 'Low';

  return {
    id: stringifyId(incident.id),
    subjectName: incident.subjectName ?? '',
    title: incident.title ?? '',
    description: incident.description ?? '',
    triggerDetails: incident.triggerDetails ?? '',
    severity,
    riskScore: typeof incident.riskScore === 'number' ? incident.riskScore : 0,
    status: incident.status ?? 'Investigating',
    createdAt: formatTimestamp(incident.createdAt),
    threatClassification: classification && classification !== 'Pending Analysis' ? classification : 'Pending Analysis',
    blastRadius: typeof incident.blastRadius === 'number' ? incident.blastRadius : 0,
    impactSummary: impactSummary ?? '',
    recommendations: parseRecommendations(incident.recommendations),
    confidence: typeof incident.confidence === 'number' ? incident.confidence : 0,
  };
}

export const formatSpacetimeIncident = formatIncident;

export function formatInvestigationNote(note: {
  id: IdLike;
  incidentId: IdLike;
  authorIdentity?: IdentityLike | string;
  authorName?: string;
  author?: string;
  initials?: string;
  content?: string;
  createdAt?: TimestampLike | string | Date;
}): FrontendInvestigationNote {
  const author = note.authorName ?? note.author ?? formatIdentity(note.authorIdentity);
  return {
    id: stringifyId(note.id),
    incidentId: stringifyId(note.incidentId),
    author,
    initials: note.initials ?? author.split(/\s+/).map(part => part[0] ?? '').join('').slice(0, 2).toUpperCase(),
    content: note.content ?? '',
    createdAt: formatTimestamp(note.createdAt),
  };
}

export function formatActivityFeedEntry(entry: {
  id: IdLike;
  incidentId: IdLike;
  action?: string;
  actorName?: string;
  actor?: string;
  createdAt?: TimestampLike | string | Date;
  kind?: FrontendActivityFeed['kind'];
}): FrontendActivityFeed {
  return {
    id: stringifyId(entry.id),
    incidentId: stringifyId(entry.incidentId),
    action: entry.action ?? '',
    actor: entry.actorName ?? entry.actor ?? '',
    createdAt: formatTimestamp(entry.createdAt),
    kind: entry.kind ?? inferActivityKind(entry.action),
  };
}

function inferActivityKind(action: string | undefined): FrontendActivityFeed['kind'] {
  const normalized = action?.toLowerCase() ?? '';
  if (normalized.includes('note')) return 'note';
  if (normalized.includes('risk')) return 'risk';
  if (normalized.includes('graph') || normalized.includes('attack path')) return 'graph';
  if (normalized.includes('analysis')) return 'analysis';
  return 'incident';
}

export function formatAuditLogEntry(entry: {
  sequenceId?: bigint | number | string;
  id?: IdLike;
  sequence?: number;
  action?: string;
  actorIdentity?: IdentityLike | string;
  actor?: string;
  timestamp?: TimestampLike | string | Date;
  previousHash?: string;
  currentHash?: string;
}): FrontendAuditLog {
  return {
    id: stringifyId(entry.id ?? entry.sequenceId),
    sequence: typeof entry.sequence === 'number'
      ? entry.sequence
      : typeof entry.sequenceId === 'bigint'
        ? Number(entry.sequenceId)
        : Number(entry.sequenceId ?? 0),
    action: entry.action ?? '',
    actor: entry.actor ?? formatIdentity(entry.actorIdentity),
    timestamp: formatTimestamp(entry.timestamp),
    previousHash: entry.previousHash ?? '',
    currentHash: entry.currentHash ?? '',
  };
}

export function formatAttackGraph(
  assets: Asset[],
  relationships: Relationship[],
): { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } {
  const nodes = assets.map(asset => ({
    id: asset.id.toString(),
    data: {
      asset: {
        id: asset.id.toString(),
        name: asset.name,
        type: asset.assetType ?? asset.type ?? 'resource',
        description: asset.description || '',
        riskLabel: asset.riskLabel ?? asset.riskLevel ?? 'Low',
      },
    },
    position: { x: 0, y: 0 },
  }));

  const edges = relationships.map((edge, index) => {
    const source = edge.sourceId ?? edge.source ?? edge.sourceAssetKey ?? '';
    const target = edge.targetId ?? edge.target ?? edge.targetAssetKey ?? '';
    return {
      id: edge.id?.toString() ?? `e-${index}-${source}-${target}`,
      source,
      target,
      label: edge.label ?? edge.relationLabel ?? '',
    };
  });

  return { nodes, edges };
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
      status: input.status ?? 'Investigating',
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
    return this.call('applyAiAnalysis', {
      incidentId,
      classification: analysis.threatClassification,
      riskScore: analysis.riskScore,
      severity: analysis.severity,
      blastRadius: analysis.blastRadius,
      confidence: analysis.confidence,
      impactSummary: analysis.impactSummary,
      recommendations: JSON.stringify(analysis.recommendations),
      assets: JSON.stringify(analysis.assets),
      relationships: JSON.stringify(analysis.edges.map(edge => ({
        source: edge.sourceId,
        target: edge.targetId,
        relationLabel: edge.label,
      }))),
    });
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
