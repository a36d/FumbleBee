import type {
  ActivityFeed,
  Asset,
  AuditLog,
  Incident,
  InvestigationNote,
  Relationship,
} from "@/lib/types";

export const incidents: Incident[] = [
  {
    id: "INC-2024-0847",
    subjectName: "Morgan Chen",
    title: "Unusual data access before departure",
    description: "A burst of sensitive repository and customer-data access preceded an unusual outbound transfer.",
    triggerDetails: "After-hours access from an unmanaged endpoint; 4.2 GB transferred to an external destination.",
    severity: "Critical",
    riskScore: 94,
    status: "Investigating",
    createdAt: "2024-11-18T09:42:00Z",
    threatClassification: "Data exfiltration",
    blastRadius: 12,
    impactSummary: "Potential exposure of customer records and unreleased product source code.",
    recommendations: ["Suspend external sharing", "Revoke active sessions", "Preserve endpoint for forensic review"],
    confidence: 96,
  },
  {
    id: "INC-2024-0846",
    subjectName: "Taylor Brooks",
    title: "Privileged credential misuse",
    description: "An elevated service credential was used outside its normal access pattern.",
    triggerDetails: "Repeated authentication failures followed by successful access to a production vault.",
    severity: "High",
    riskScore: 81,
    status: "In review",
    createdAt: "2024-11-18T08:16:00Z",
    threatClassification: "Credential misuse",
    blastRadius: 8,
    impactSummary: "Production secrets may have been viewed by an unauthorized identity.",
    recommendations: ["Rotate affected credentials", "Review vault access history"],
    confidence: 89,
  },
  {
    id: "INC-2024-0845",
    subjectName: "Jordan Lee",
    title: "Mass file download detected",
    description: "A user downloaded a large volume of files from a restricted team share.",
    triggerDetails: "Unusual volume of 1,840 files synced in a 14-minute window.",
    severity: "High",
    riskScore: 76,
    status: "Investigating",
    createdAt: "2024-11-18T07:51:00Z",
    threatClassification: "Bulk data access",
    blastRadius: 5,
    impactSummary: "Project files may have been copied to an unapproved device.",
    recommendations: ["Verify device ownership", "Review downloaded file inventory"],
    confidence: 85,
  },
  {
    id: "INC-2024-0844",
    subjectName: "Alex Rivera",
    title: "Off-hours access anomaly",
    description: "Multiple systems were accessed outside the employee's regular working hours.",
    triggerDetails: "Access from a new location at 02:14 UTC.",
    severity: "Medium",
    riskScore: 58,
    status: "In review",
    createdAt: "2024-11-17T22:14:00Z",
    threatClassification: "Anomalous access",
    blastRadius: 3,
    impactSummary: "No confirmed data movement; identity activity requires verification.",
    recommendations: ["Confirm activity with the account owner"],
    confidence: 77,
  },
  {
    id: "INC-2024-0843",
    subjectName: "Sam Patel",
    title: "Unapproved USB device connected",
    description: "An external storage device was connected to a managed workstation.",
    triggerDetails: "Device serial not present in the approved hardware registry.",
    severity: "Low",
    riskScore: 32,
    status: "Contained",
    createdAt: "2024-11-17T18:09:00Z",
    threatClassification: "Removable media",
    blastRadius: 1,
    impactSummary: "Device was blocked by endpoint controls; no files were transferred.",
    recommendations: ["Confirm device ownership"],
    confidence: 94,
  },
];

export const assets: Asset[] = [
  { id: "u-morgan", name: "Morgan Chen", type: "identity", description: "Senior Product Engineer · mchen@acme.io", riskLabel: "Compromised identity" },
  { id: "s-eng", name: "Engineering Share", type: "share", description: "Restricted · 2.4 TB · 1,280 files", riskLabel: "Sensitive access" },
  { id: "s-source", name: "Source Repository", type: "share", description: "Product source · 46 repositories", riskLabel: "High-value asset" },
  { id: "d-customer", name: "Customer DB", type: "database", description: "Production · 84,209 records", riskLabel: "Critical data" },
];

export const relationships: Relationship[] = [
  { id: "r1", sourceId: "u-morgan", targetId: "s-eng", label: "accessed" },
  { id: "r2", sourceId: "s-eng", targetId: "s-source", label: "downloaded" },
  { id: "r3", sourceId: "s-source", targetId: "d-customer", label: "queried" },
];

export const notes: InvestigationNote[] = [
  { id: "n1", incidentId: "INC-2024-0847", author: "Priya Shah", initials: "PS", content: "Confirmed the device is not enrolled in endpoint management. Preserving sign-in and file access logs.", createdAt: "2024-11-18T10:12:00Z" },
  { id: "n2", incidentId: "INC-2024-0847", author: "David Kim", initials: "DK", content: "Manager notified. Employee's last working day is scheduled for Friday.", createdAt: "2024-11-18T10:03:00Z" },
];

export const activity: ActivityFeed[] = [
  { id: "a1", incidentId: "INC-2024-0847", action: "AI analysis completed", actor: "SentinelGraph AI", createdAt: "2024-11-18T10:14:00Z", kind: "analysis" },
  { id: "a2", incidentId: "INC-2024-0847", action: "Investigation note added", actor: "Priya Shah", createdAt: "2024-11-18T10:12:00Z", kind: "note" },
  { id: "a3", incidentId: "INC-2024-0847", action: "Risk score increased to 94", actor: "SentinelGraph AI", createdAt: "2024-11-18T10:06:00Z", kind: "risk" },
  { id: "a4", incidentId: "INC-2024-0847", action: "Attack path generated", actor: "SentinelGraph AI", createdAt: "2024-11-18T09:44:00Z", kind: "graph" },
  { id: "a5", incidentId: "INC-2024-0847", action: "Incident created", actor: "Detection engine", createdAt: "2024-11-18T09:42:00Z", kind: "incident" },
];

export const auditLogs: AuditLog[] = [
  { id: "l3", sequence: 3, action: "AI analysis completed", actor: "sentinelgraph.ai", timestamp: "2024-11-18T10:14:00Z", previousHash: "97af0c1a8b2e5d40", currentHash: "c04e8db7f912a6e3" },
  { id: "l2", sequence: 2, action: "Investigation note added", actor: "priya.shah@acme.io", timestamp: "2024-11-18T10:12:00Z", previousHash: "f63d281a4c91b7e0", currentHash: "97af0c1a8b2e5d40" },
  { id: "l1", sequence: 1, action: "Incident created", actor: "detection.engine", timestamp: "2024-11-18T09:42:00Z", previousHash: "0000000000000000", currentHash: "f63d281a4c91b7e0" },
];

export const relativeTime = (date: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(date));
