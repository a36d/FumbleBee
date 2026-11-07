import type { Severity, IncidentStatus } from "@/lib/types";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`severity-badge severity-${severity.toLowerCase()}`}><i />{severity}</span>;
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`status-badge status-${status.toLowerCase().replaceAll(" ", "-")}`}><i />{status}</span>;
}
