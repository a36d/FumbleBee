"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { incidents } from "@/lib/mock-data";
import type { Incident, IncidentStatus, Severity } from "@/lib/types";
import { MetricCard } from "@/components/metric-card";
import { SeverityBadge, StatusBadge } from "@/components/severity-badge";
import { useSpacetimeConnection } from "@/components/spacetime-connection-provider";
import { tables } from "@/generated/spacetimedb";
import type {
  Asset as LiveAsset,
  AuditLog as LiveAuditLog,
  Incident as LiveIncident,
  User as LiveUser,
} from "@/generated/spacetimedb/types";

const riskTone = (score: number) => score >= 85 ? "risk-critical" : score >= 70 ? "risk-high" : score >= 45 ? "risk-medium" : "risk-low";

const commonSubjectSuggestions = [
  "svc-prod-data-pipeline",
  "aws-iam-admin",
  "corp-laptop-finance",
];

function formatRelativeTime(date: Date): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (elapsedSeconds < 60) return "just now";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return elapsedDays === 1 ? "1 day ago" : `${elapsedDays} days ago`;
}

export function Dashboard() {
  const router = useRouter();
  const { connection } = useSpacetimeConnection();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"All severity" | Severity>("All severity");
  const [localIncidents, setLocalIncidents] = useState(incidents);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [liveAssets, setLiveAssets] = useState<LiveAsset[]>([]);
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [liveAuditLogs, setLiveAuditLogs] = useState<LiveAuditLog[]>([]);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!connection) {
      setLiveIncidents([]);
      setLiveAssets([]);
      setLiveUsers([]);
      setLiveAuditLogs([]);
      return;
    }

    let active = true;
    const refreshIncidents = () => {
      if (active) setLiveIncidents(Array.from(connection.db.incident.iter()) as LiveIncident[]);
    };
    const refreshAssets = () => {
      if (active) setLiveAssets(Array.from(connection.db.asset.iter()) as LiveAsset[]);
    };
    const refreshUsers = () => {
      if (active) setLiveUsers(Array.from(connection.db.user.iter()) as LiveUser[]);
    };
    const refreshAuditLogs = () => {
      if (active) setLiveAuditLogs(Array.from(connection.db.auditLog.iter()) as LiveAuditLog[]);
    };

    refreshIncidents();
    refreshAssets();
    refreshUsers();
    refreshAuditLogs();
    connection.db.incident.onInsert(refreshIncidents);
    connection.db.incident.onUpdate(refreshIncidents);
    connection.db.asset.onInsert(refreshAssets);
    connection.db.asset.onUpdate(refreshAssets);
    connection.db.user.onInsert(refreshUsers);
    connection.db.user.onUpdate(refreshUsers);
    connection.db.auditLog.onInsert(refreshAuditLogs);
    connection.db.auditLog.onUpdate(refreshAuditLogs);
    connection.db.auditLog.onDelete(refreshAuditLogs);
    connection.subscriptionBuilder()
      .subscribe([tables.incident, tables.asset, tables.user, tables.auditLog]);

    return () => {
      active = false;
      connection.db.incident.removeOnInsert(refreshIncidents);
      connection.db.incident.removeOnUpdate(refreshIncidents);
      connection.db.asset.removeOnInsert(refreshAssets);
      connection.db.asset.removeOnUpdate(refreshAssets);
      connection.db.user.removeOnInsert(refreshUsers);
      connection.db.user.removeOnUpdate(refreshUsers);
      connection.db.auditLog.removeOnInsert(refreshAuditLogs);
      connection.db.auditLog.removeOnUpdate(refreshAuditLogs);
      connection.db.auditLog.removeOnDelete(refreshAuditLogs);
    };
  }, [connection]);

  const displayIncidents: Incident[] = liveIncidents.length
    ? liveIncidents.map((incident) => ({
        id: incident.id.toString(),
        title: incident.title,
        subjectName: incident.subjectName,
        description: incident.description,
        triggerDetails: incident.triggerDetails,
        severity: ["Critical", "High", "Medium", "Low"].includes(incident.severity)
          ? incident.severity as Severity
          : "Medium",
        riskScore: Number(incident.riskScore),
        status: ["Investigating", "In review", "Contained", "Closed"].includes(incident.status)
          ? incident.status as IncidentStatus
          : "Investigating",
        createdAt: new Date(Number(incident.createdAt.microsSinceUnixEpoch / 1000n)).toISOString(),
        threatClassification: incident.classification,
        blastRadius: Number(incident.blastRadius),
        impactSummary: incident.impactSummary,
        recommendations: (() => {
          try {
            const parsed = JSON.parse(incident.recommendations);
            return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
          } catch {
            return [];
          }
        })(),
        confidence: Number(incident.confidence),
      }))
    : localIncidents;

  const subjectSuggestions = Array.from(new Set([
    ...liveUsers.map((user) => user.name.trim()).filter(Boolean),
    ...liveAssets.map((asset) => asset.name.trim()).filter(Boolean),
    ...commonSubjectSuggestions,
  ]));

  const priorityIncidents = liveIncidents
    .filter((incident) =>
      incident.status.toLowerCase() !== "resolved" &&
      ["Critical", "High"].includes(incident.severity)
    )
    .sort((left, right) => {
      const leftTime = left.createdAt.microsSinceUnixEpoch;
      const rightTime = right.createdAt.microsSinceUnixEpoch;
      if (leftTime === rightTime) return right.id > left.id ? 1 : -1;
      return rightTime > leftTime ? 1 : -1;
    })
    .slice(0, 3);

  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const chartCounts = chartDays.map((day) => {
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    return liveAuditLogs.filter((entry) => {
      const timestamp = new Date(Number(entry.timestamp.microsSinceUnixEpoch / 1000n));
      return timestamp >= day && timestamp < nextDay;
    }).length;
  });
  const chartMax = Math.max(1, ...chartCounts);
  const chartHeights = chartCounts.map((count) => Math.round((count / chartMax) * 100));
  const visibleOpenIncidents = displayIncidents.filter((incident) => {
    const status = incident.status.toLowerCase();
    return status !== "resolved" && status !== "contained" && status !== "closed";
  });
  const activeInvestigationCount = visibleOpenIncidents.length;
  const highRiskSubjects = new Set(
    visibleOpenIncidents
      .filter((incident) => incident.severity === "Critical" || incident.severity === "High")
      .map((incident) => incident.subjectName.trim().toLowerCase())
      .filter(Boolean),
  );
  const highRiskUserCount = highRiskSubjects.size;
  const atRiskAssetCount = new Set(
    visibleOpenIncidents
      .map((incident) => incident.subjectName.trim().toLowerCase())
      .filter(Boolean),
  ).size || liveAssets.filter((asset) => {
    const status = asset.compromiseStatus.toLowerCase();
    return status === "at-risk" || status === "at_risk" || status === "high" || status === "critical";
  }).length || liveAssets.length;
  const recentAlertCount = liveAuditLogs.length || visibleOpenIncidents.length;

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = displayIncidents.filter((incident) => {
    const matchesSearch = `${incident.id} ${incident.title} ${incident.subjectName}`
      .toLowerCase()
      .includes(normalizedQuery);
    const matchesSeverity = severityFilter === "All severity" || incident.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });
  const hasActiveFilters = normalizedQuery.length > 0 || severityFilter !== "All severity";

  function clearFilters() {
    setQuery("");
    setSeverityFilter("All severity");
  }

  async function createIncident(formData: FormData) {
    const title = String(formData.get("title") || "").trim();
    const subjectName = String(formData.get("subjectName") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const severity = String(formData.get("severity") || "Medium");
    const initialNotes = String(formData.get("triggerDetails") || "").trim();
    if (!title || !description) {
      setCreateError("Title and description are required.");
      return;
    }
    if (!connection) {
      setCreateError("SpacetimeDB is not connected.");
      return;
    }

    setCreating(true);
    setCreateError("");
    const existingIds = new Set(liveIncidents.map((incident) => incident.id.toString()));
    let timeoutId: number | undefined;
    let removeListener: (() => void) | undefined;
    const createdIncident = new Promise<LiveIncident>((resolve, reject) => {
      const matchCreatedIncident = (_context: unknown, row: LiveIncident) => {
        if (
          !existingIds.has(row.id.toString()) &&
          row.title === title &&
          row.description === description
        ) resolve(row);
      };
      connection.db.incident.onInsert(matchCreatedIncident);
      removeListener = () => connection.db.incident.removeOnInsert(matchCreatedIncident);
      timeoutId = window.setTimeout(
        () => reject(new Error("Incident was created, but its live record did not arrive. Check the investigations table.")),
        15000,
      );
    });

    try {
      await connection.reducers.createIncident({
        title,
        description,
        severity,
        initialNotes: initialNotes || subjectName,
      });
      const cached = Array.from(connection.db.incident.iter())
        .filter((row) =>
          !existingIds.has(row.id.toString()) &&
          row.title === title &&
          row.description === description
        )
        .sort((left, right) => left.id > right.id ? -1 : 1)[0] as LiveIncident | undefined;
      if (cached) {
        removeListener?.();
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        setDialogOpen(false);
        router.push(`/investigations/${cached.id.toString()}`);
        return;
      }
      const created = await createdIncident;
      setDialogOpen(false);
      router.push(`/investigations/${created.id.toString()}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Incident creation failed.");
    } finally {
      removeListener?.();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setCreating(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> MONDAY, NOVEMBER 18, 2024</div><h1>Security overview</h1><p className="page-subtitle">Monitor and investigate insider threat activity across your organization.</p></div>
        <button className="button button-primary" onClick={() => setDialogOpen(true)}>New investigation</button>
      </div>
      <div className="metric-grid">
        <MetricCard
          label="Active investigations"
          value={String(activeInvestigationCount)}
        />
        <MetricCard
          label="High-risk users / responders"
          value={String(highRiskUserCount)}
        />
        <MetricCard
          label="Assets at risk"
          value={String(atRiskAssetCount)}
        />
        <MetricCard
          label="Recent alerts"
          value={String(recentAlertCount)}
        />
      </div>

      <section className="panel investigations-panel">
        <div className="panel-heading">
          <div><div className="section-title-row"><h2>Investigations</h2><span className="count-pill">{displayIncidents.length}</span></div><p>Review and manage active threat investigations</p></div>
          <div className="table-actions">
            <label className="table-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search investigations..." /></label>
            <select
              className="button button-secondary filter-button severity-filter-select"
              aria-label="Filter investigations by severity"
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as "All severity" | Severity)}
            >
              <option value="All severity">All severity</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>INVESTIGATION</th><th>SUBJECT</th><th>SEVERITY</th><th>RISK SCORE</th><th>STATUS</th><th>CREATED</th><th /></tr></thead>
            <tbody>{filtered.map((incident) => (
              <tr key={incident.id}>
                <td><Link className="investigation-title" href={`/investigations/${incident.id}`}>{incident.title}</Link><span className="incident-id">{incident.id}</span></td>
                <td><span className="subject-cell"><span className="avatar avatar-row">{incident.subjectName.split(" ").map((part) => part[0]).join("")}</span>{incident.subjectName}</span></td>
                <td><SeverityBadge severity={incident.severity} /></td>
                <td><span className={`risk-score ${riskTone(incident.riskScore)}`}>{incident.riskScore}<span>/100</span></span></td>
                <td><StatusBadge status={incident.status} /></td>
                <td className="created-cell">{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(incident.createdAt))}</td>
                <td><Link className="row-action" href={`/investigations/${incident.id}`} aria-label={`View ${incident.title}`}><ArrowRight size={16} /></Link></td>
              </tr>
            ))}</tbody>
          </table>
          {filtered.length === 0 && <div className="empty-state">No investigations match the active search and severity filters.</div>}
        </div>
        <div className="table-footer">
          <span>Showing <strong>{filtered.length}</strong> of <strong>{displayIncidents.length}</strong> investigations</span>
          {hasActiveFilters && <button type="button" onClick={clearFilters}>View all investigations</button>}
        </div>
      </section>
      <div className="dashboard-bottom">
        <section className="panel mini-panel">
          <div className="mini-title"><div><h3>Threat activity</h3><span>Last 7 days</span></div></div>
          <div className="activity-chart" aria-label="Threat activity trend chart">
            <div className="chart-y-labels"><span>{chartMax}</span><span>{Math.ceil(chartMax / 2)}</span><span>0</span></div>
            <div className="chart-plot">
              <div className="chart-gridline one" /><div className="chart-gridline two" />
              <div className="chart-bars">
                {chartHeights.map((height, index) => (
                  <i
                    key={chartDays[index].toISOString()}
                    style={{ height: `${height}%` }}
                    title={`${chartCounts[index]} audit events`}
                  />
                ))}
              </div>
              <div className="chart-days">
                {chartDays.map((day) => <span key={day.toISOString()}>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(day).slice(0, 2)}</span>)}
              </div>
            </div>
          </div>
        </section>
        <section className="panel mini-panel alert-panel">
          <div className="mini-title"><div><h3>Needs your attention</h3><span>Priority follow-ups</span></div></div>
          {priorityIncidents.length === 0 ? (
            <div className="empty-attention-state">No critical follow-ups pending</div>
          ) : priorityIncidents.map((incident) => {
            const severity = incident.severity as Severity;
            const createdAt = new Date(Number(incident.createdAt.microsSinceUnixEpoch / 1000n));
            return (
              <Link key={incident.id.toString()} href={`/investigations/${incident.id.toString()}`} className="attention-item">
                <span className={`attention-dot ${severity === "High" ? "attention-amber" : ""}`} />
                <span>
                  <strong>{incident.title}</strong>
                  <small>{incident.subjectName || "Unassigned subject"} · {formatRelativeTime(createdAt)}</small>
                </span>
                <SeverityBadge severity={severity} />
              </Link>
            );
          })}
        </section>
      </div>
      {dialogOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-investigation-title"><div className="modal-heading"><div><h2 id="new-investigation-title">New investigation</h2><p>Create an investigation to start tracking a potential threat.</p></div><button className="icon-button" onClick={() => setDialogOpen(false)} aria-label="Close dialog"><X size={18} /></button></div><form action={createIncident} className="modal-form"><label>Investigation title<input name="title" placeholder="e.g. Unusual data access" required /></label><label>Subject name<input name="subjectName" list="subject-suggestions" placeholder="e.g. svc-prod-data-pipeline or employee name" required /><datalist id="subject-suggestions">{subjectSuggestions.map((subject) => <option key={subject} value={subject} />)}</datalist></label><label>Severity<select name="severity" defaultValue="Medium" className="bg-zinc-900 text-zinc-100 border border-zinc-700" style={{ color: "#f4f4f5", backgroundColor: "#18181b" }}><option className="bg-zinc-900 text-zinc-100" style={{ color: "#f4f4f5", backgroundColor: "#18181b" }} value="Low">Low</option><option className="bg-zinc-900 text-zinc-100" style={{ color: "#f4f4f5", backgroundColor: "#18181b" }} value="Medium">Medium</option><option className="bg-zinc-900 text-zinc-100" style={{ color: "#f4f4f5", backgroundColor: "#18181b" }} value="High">High</option><option className="bg-zinc-900 text-zinc-100" style={{ color: "#f4f4f5", backgroundColor: "#18181b" }} value="Critical">Critical</option></select></label><label>Description<textarea name="description" rows={3} placeholder="What happened? Include any relevant context." required /></label><label>Trigger details<textarea name="triggerDetails" rows={2} placeholder="Alert source, observed behavior, or detection signal" /></label>{createError && <p className="form-error" role="alert">{createError}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setDialogOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={creating}>{creating ? "Creating..." : "Create investigation"}</button></div></form></section></div>}
    </>
  );
}
