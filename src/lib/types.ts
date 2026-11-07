export type Severity = "Critical" | "High" | "Medium" | "Low";
export type IncidentStatus = "Investigating" | "In review" | "Contained" | "Closed";
export type AssetType = "identity" | "share" | "database";

export interface Incident {
  id: string;
  subjectName: string;
  title: string;
  description: string;
  triggerDetails: string;
  severity: Severity;
  riskScore: number;
  status: IncidentStatus;
  createdAt: string;
  threatClassification: string;
  blastRadius: number;
  impactSummary: string;
  recommendations: string[];
  confidence: number;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  description: string;
  riskLabel: string;
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
}

export interface InvestigationNote {
  id: string;
  incidentId: string;
  author: string;
  initials: string;
  content: string;
  createdAt: string;
}

export interface ActivityFeed {
  id: string;
  incidentId: string;
  action: string;
  actor: string;
  createdAt: string;
  kind: "incident" | "note" | "analysis" | "risk" | "graph";
}

export interface AuditLog {
  id: string;
  sequence: number;
  action: string;
  actor: string;
  timestamp: string;
  previousHash: string;
  currentHash: string;
}
