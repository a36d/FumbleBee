"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { tables } from "@/generated/spacetimedb";
import type { ActivityFeed as LiveActivity, Incident as LiveIncident, User as LiveUser } from "@/generated/spacetimedb/types";
import { SeverityBadge, StatusBadge } from "@/components/severity-badge";
import { useSpacetimeConnection } from "@/components/spacetime-connection-provider";
import { incidents as demoIncidents } from "@/lib/mock-data";
import type { Incident as FrontendIncident, Severity } from "@/lib/types";
import { normalizeRole } from "@/lib/roles";

const riskTone = (score: number) => score >= 85 ? "risk-critical" : score >= 70 ? "risk-high" : score >= 45 ? "risk-medium" : "risk-low";
type IncidentSortKey = "title" | "severity" | "riskScore" | "classification" | "status" | "lastUpdated";
type HubIncident = {
  id: string;
  title: string;
  subjectName: string;
  severity: Severity;
  riskScore: number;
  classification: string;
  status: string;
  owner: string;
  assignedTo: string;
  isLive: boolean;
  createdAt: Date;
  lastUpdated: Date;
};

export function IncidentHub({ personalOnly = false }: { personalOnly?: boolean }) {
  const router = useRouter();
  const { connection, connectionError, responderSession } = useSpacetimeConnection();
  const [incidents, setIncidents] = useState<LiveIncident[]>([]);
  const [activities, setActivities] = useState<LiveActivity[]>([]);
  const [responders, setResponders] = useState<LiveUser[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<IncidentSortKey>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!connection) {
      setIncidents([]);
      setActivities([]);
      setResponders([]);
      return;
    }

    let active = true;
    const refreshIncidents = () => {
      if (!active) return;
      setIncidents(Array.from(connection.db.incident.iter()) as LiveIncident[]);
    };
    const refreshActivities = () => {
      if (active) setActivities(Array.from(connection.db.activityFeed.iter()) as LiveActivity[]);
    };
    const refreshResponders = () => {
      if (active) setResponders(Array.from(connection.db.user.iter()) as LiveUser[]);
    };

    connection.db.incident.onInsert(refreshIncidents);
    connection.db.incident.onUpdate(refreshIncidents);
    connection.db.incident.onDelete(refreshIncidents);
    connection.db.activityFeed.onInsert(refreshActivities);
    connection.db.activityFeed.onUpdate(refreshActivities);
    connection.db.activityFeed.onDelete(refreshActivities);
    connection.db.user.onInsert(refreshResponders);
    connection.db.user.onUpdate(refreshResponders);
    connection.db.user.onDelete(refreshResponders);
    const subscription = connection.subscriptionBuilder()
      .onApplied(() => {
        refreshIncidents();
        refreshActivities();
        refreshResponders();
      })
      .onError((context) => {
        if (active) setError(`Could not subscribe to incidents: ${context.event?.message ?? "unknown subscription error"}`);
      })
      .subscribe([tables.incident, tables.activityFeed, tables.user]);

    return () => {
      active = false;
      connection.db.incident.removeOnInsert(refreshIncidents);
      connection.db.incident.removeOnUpdate(refreshIncidents);
      connection.db.incident.removeOnDelete(refreshIncidents);
      connection.db.activityFeed.removeOnInsert(refreshActivities);
      connection.db.activityFeed.removeOnUpdate(refreshActivities);
      connection.db.activityFeed.removeOnDelete(refreshActivities);
      connection.db.user.removeOnInsert(refreshResponders);
      connection.db.user.removeOnUpdate(refreshResponders);
      connection.db.user.removeOnDelete(refreshResponders);
      subscription.unsubscribe();
    };
  }, [connection]);

  const latestActivityByIncident = useMemo(() => {
    const latest = new Map<string, Date>();
    for (const activity of activities) {
      const incidentId = activity.incidentId.toString();
      const updatedAt = new Date(Number(activity.createdAt.microsSinceUnixEpoch / 1000n));
      const current = latest.get(incidentId);
      if (!current || updatedAt > current) latest.set(incidentId, updatedAt);
    }
    return latest;
  }, [activities]);
  const displayIncidents = useMemo<HubIncident[]>(() => {
    const source: HubIncident[] = incidents.length
      ? incidents.map((incident) => {
          const createdAt = new Date(Number(incident.createdAt.microsSinceUnixEpoch / 1000n));
          return {
            id: incident.id.toString(),
            title: incident.title,
            subjectName: incident.subjectName,
            severity: normalizeSeverity(incident.severity),
            riskScore: Number(incident.riskScore),
            classification: incident.classification || "Pending Analysis",
            status: incident.status,
            owner: incident.owner,
            assignedTo: incident.assignedTo,
            isLive: true,
            createdAt,
            lastUpdated: latestActivityByIncident.get(incident.id.toString()) ?? createdAt,
          };
        })
      : demoIncidents.map((incident: FrontendIncident) => ({
          id: incident.id,
          title: incident.title,
          subjectName: incident.subjectName,
          severity: incident.severity,
          riskScore: incident.riskScore,
          classification: incident.threatClassification || "Pending Analysis",
          status: incident.status,
          owner: incident.owner ?? "",
          assignedTo: incident.assignedTo ?? incident.owner ?? "",
          isLive: false,
          createdAt: new Date(incident.createdAt),
          lastUpdated: new Date(incident.createdAt),
        }));

    const username = responderSession?.username.trim().toLowerCase();
    const visible = personalOnly
      ? username
        ? source.filter((incident) =>
            incident.owner.trim().toLowerCase() === username ||
            incident.assignedTo.trim().toLowerCase() === username,
          )
        : []
      : source;
    return visible.sort((left, right) => {
      const compare = (() => {
        switch (sortKey) {
          case "title":
            return left.title.localeCompare(right.title);
          case "severity":
            return severityRank(left.severity) - severityRank(right.severity);
          case "riskScore":
            return left.riskScore - right.riskScore;
          case "classification":
            return left.classification.localeCompare(right.classification);
          case "status":
            return left.status.localeCompare(right.status);
          case "lastUpdated":
            return left.lastUpdated.getTime() - right.lastUpdated.getTime();
        }
      })();
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [incidents, latestActivityByIncident, personalOnly, responderSession?.username, sortDirection, sortKey]);
  const activeIncidents = useMemo(
    () => displayIncidents.filter((incident) => !["closed", "contained"].includes(incident.status.toLowerCase())),
    [displayIncidents],
  );
  const criticalCount = useMemo(
    () => activeIncidents.filter((incident) => incident.severity.toLowerCase() === "critical").length,
    [activeIncidents],
  );
  const canDeclare = !personalOnly && normalizeRole(responderSession?.role) === "Admin";
  const employeeResponders = useMemo(
    () => responders.filter((responder) => normalizeRole(responder.role) === "Employee"),
    [responders],
  );

  function changeSort(nextKey: IncidentSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "lastUpdated" ? "desc" : "asc");
  }

  async function assignIncident(incidentId: string, assigneeUsername: string) {
    if (!connection) {
      setError(connectionError || "SpacetimeDB is not connected. Try again when the connection is restored.");
      return;
    }
    if (!assigneeUsername) return;
    setError("");
    try {
      await connection.reducers.assignIncident({
        incidentId: BigInt(incidentId),
        assigneeUsername,
      });
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Incident assignment failed.");
    }
  }

  async function declareIncident(formData: FormData) {
    if (creating) return;
    if (!connection) {
      setError(connectionError || "SpacetimeDB is not connected yet. Start the local database and try again.");
      return;
    }
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const severity = String(formData.get("severity") ?? "Medium") as Severity;
    const triageNotes = String(formData.get("triageNotes") ?? "").trim();
    if (!title || !description) {
      setError("Enter an incident title and description.");
      return;
    }

    const identity = connection.identity;
    if (!identity) {
      setError("SpacetimeDB has not identified this user. Reconnect and try again.");
      return;
    }

    setCreating(true);
    setError("");
    const existingIncidentIds = new Set(
      Array.from(connection.db.incident.iter(), (incident) => incident.id.toString()),
    );
    let timeoutId: number | undefined;
    let removeIncidentListener = () => {};
    let resolveCreatedIncident: (incident: LiveIncident) => void = () => {};
    const createdIncident = new Promise<LiveIncident>((resolve, reject) => {
      resolveCreatedIncident = resolve;
      const matchCreatedIncident = (_context: unknown, row: LiveIncident) => {
        if (
          !existingIncidentIds.has(row.id.toString()) &&
          row.createdBy.isEqual(identity) &&
          row.title === title &&
          row.description === description
        ) {
          resolve(row);
        }
      };
      connection.db.incident.onInsert(matchCreatedIncident);
      removeIncidentListener = () => connection.db.incident.removeOnInsert(matchCreatedIncident);
      timeoutId = window.setTimeout(
        () => reject(new Error("Incident was created, but its live record did not arrive. Check the hub before retrying.")),
        15000,
      );
    });

    try {
      await connection.reducers.createIncident({
        title,
        description,
        severity,
        initialNotes: triageNotes,
      });
      const cachedIncident = Array.from(connection.db.incident.iter())
        .filter((row) =>
          !existingIncidentIds.has(row.id.toString()) &&
          row.createdBy.isEqual(identity) &&
          row.title === title &&
          row.description === description,
        )
        .sort((left, right) => left.id > right.id ? -1 : 1)[0];
      if (cachedIncident) resolveCreatedIncident(cachedIncident);
      const created = await createdIncident;
      setCreateOpen(false);
      router.push(`/investigations/${created.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Incident creation failed.");
    } finally {
      removeIncidentListener();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setCreating(false);
    }
  }

  return (
    <>
      <section className="incident-hub-banner">
        <div className="incident-hub-heading">
          <div className="eyebrow"><span className="eyebrow-line" /> {personalOnly ? "ASSIGNED RESPONSE QUEUE" : "SOVEREIGN RESPONSE ENVIRONMENT"}</div>
          <h1>{personalOnly ? "Personal Incidents" : "Security Incidents"}</h1>
          <p>{personalOnly ? "Incidents assigned to your account." : "Live incident operations across your organization."}</p>
        </div>
        {!personalOnly && <div className="incident-hub-metrics">
          <div className="hub-metric-chip"><span>Total Active Incidents</span><strong>{activeIncidents.length}</strong></div>
          <div className="hub-metric-chip hub-critical-chip"><span>Critical Severity</span><strong>{criticalCount}</strong></div>
          <div className="hub-metric-chip hub-health-chip"><span>System Health</span><strong>Sovereign / Air-Gapped</strong></div>
        </div>}
      </section>

      <div className="page-heading incident-list-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> INCIDENT OPERATIONS</div>
          <h2>{personalOnly ? "Your assigned incidents" : "All incidents"}</h2>
          <p className="page-subtitle">{personalOnly ? "Only incidents owned by or assigned to your username appear here." : "Monitor severity, risk, and investigation status in real time."}</p>
        </div>
        {canDeclare && <button className="button button-primary" onClick={() => { setError(""); setCreateOpen(true); }}>
          <Plus size={15} /> Declare New Incident
        </button>}
      </div>

      {(error || connectionError) && <p className="analysis-error" role="alert">{error || connectionError}</p>}

      <section className="panel incident-hub-panel">
        <div className="panel-heading">
          <div><div className="section-title-row"><h2>{personalOnly ? "Assigned incident register" : "Incident register"}</h2><span className="count-pill">{displayIncidents.length}</span></div><p>{incidents.length ? "Live SpacetimeDB incidents. Select a column heading to sort." : personalOnly ? "Personal incident assignments are loaded from your live account records." : "Demo incidents are shown until live records are available. Select a column heading to sort."}</p></div>
          {!personalOnly && <Link className="hub-overview-link" href="/">Security overview</Link>}
        </div>
        {displayIncidents.length ? (
          <div className="table-wrap">
            <table className="incident-hub-table">
              <thead><tr>
                <th aria-sort={sortKey === "title" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><button className="incident-sort-button" onClick={() => changeSort("title")}>INCIDENT{sortKey === "title" && <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>}</button></th>
                <th aria-sort={sortKey === "severity" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><button className="incident-sort-button" onClick={() => changeSort("severity")}>SEVERITY{sortKey === "severity" && <span>{sortDirection === "asc" ? "↑" : "↓"}</span>}</button></th>
                <th aria-sort={sortKey === "riskScore" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><button className="incident-sort-button" onClick={() => changeSort("riskScore")}>RISK SCORE{sortKey === "riskScore" && <span>{sortDirection === "asc" ? "↑" : "↓"}</span>}</button></th>
                <th aria-sort={sortKey === "classification" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><button className="incident-sort-button" onClick={() => changeSort("classification")}>CLASSIFICATION{sortKey === "classification" && <span>{sortDirection === "asc" ? "↑" : "↓"}</span>}</button></th>
                <th aria-sort={sortKey === "status" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><button className="incident-sort-button" onClick={() => changeSort("status")}>STATUS{sortKey === "status" && <span>{sortDirection === "asc" ? "↑" : "↓"}</span>}</button></th>
                <th aria-sort={sortKey === "lastUpdated" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><button className="incident-sort-button" onClick={() => changeSort("lastUpdated")}>LAST UPDATED{sortKey === "lastUpdated" && <span>{sortDirection === "asc" ? "↑" : "↓"}</span>}</button></th>
                {!personalOnly && <th>ASSIGNED TO</th>}
                <th />
              </tr></thead>
              <tbody>
                {displayIncidents.map((incident) => {
                  const riskScore = incident.riskScore;
                  return (
                    <tr key={incident.id}>
                      <td data-label="Incident"><Link className="hub-incident-title" href={`/investigations/${incident.id}`}><span>#{incident.id}</span>{incident.title}</Link><small className="hub-incident-subject">{incident.subjectName}</small></td>
                      <td data-label="Severity"><SeverityBadge severity={incident.severity} /></td>
                      <td data-label="Risk score"><div className="hub-risk-meter"><span className={`risk-score ${riskTone(riskScore)}`}>{riskScore}<small>/100</small></span><i><span className={riskTone(riskScore)} style={{ width: `${Math.min(100, Math.max(0, riskScore))}%` }} /></i></div></td>
                      <td data-label="Classification"><span className="hub-classification">{incident.classification}</span></td>
                      <td data-label="Status"><StatusBadge status={normalizeStatus(incident.status)} /></td>
                      <td data-label="Last updated" className="created-cell">{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(incident.lastUpdated)}</td>
                      {!personalOnly && <td data-label="Assigned to">
                        {canDeclare && incident.isLive ? (
                          <select
                            className="incident-assignee-select"
                            value={incident.assignedTo}
                            aria-label={`Assign incident ${incident.id}`}
                            onChange={(event) => void assignIncident(incident.id, event.target.value)}
                          >
                            <option value="">{incident.owner || "Unassigned"}</option>
                            {employeeResponders.map((responder) => (
                              <option key={responder.username} value={responder.username}>{responder.username}</option>
                            ))}
                          </select>
                        ) : <span>{incident.assignedTo || incident.owner || "Unassigned"}</span>}
                      </td>}
                      <td data-label="Open"><Link className="row-action" href={`/investigations/${incident.id}`} aria-label={`Open incident ${incident.id}`}><ArrowRight size={16} /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="incident-hub-empty">
            <strong>{personalOnly ? "No personal incidents assigned" : connection ? "No incidents are available." : "Connecting to the incident register..."}</strong>
            <span>{personalOnly ? "Incidents you own or that are assigned to your username will appear here." : connection ? "Declare a new incident to begin a live investigation." : connectionError || "Waiting for the SpacetimeDB connection."}</span>
          </div>
        )}
      </section>

      {createOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) setCreateOpen(false); }}>
          <section className="modal-card incident-create-modal" role="dialog" aria-modal="true" aria-labelledby="declare-incident-title">
            <div className="modal-heading">
              <div><span className="auth-kicker">INCIDENT COMMAND</span><h2 id="declare-incident-title">Declare New Incident</h2><p>Create a live incident and route directly to its investigation workspace.</p></div>
              <button className="icon-button" onClick={() => setCreateOpen(false)} disabled={creating} aria-label="Close declare incident dialog"><X size={18} /></button>
            </div>
            <form onSubmit={(event) => {
              event.preventDefault();
              void declareIncident(new FormData(event.currentTarget));
            }} className="modal-form">
              {!connection && <p className="incident-create-connection" role="status">{connectionError || "Connecting to SpacetimeDB… Incident creation will be available when the database is online."}</p>}
              <label>Incident Title<input name="title" placeholder="e.g. Unusual bulk data access" required /></label>
              <label>Description<textarea name="description" rows={3} placeholder="Summarize the observed incident and context." required /></label>
              <label>Severity<select name="severity" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
              <label>Initial Forensic Triage Notes<textarea name="triageNotes" rows={3} placeholder="Evidence handling, initial findings, or collection instructions." /></label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={creating || !connection}>{creating ? "Declaring incident..." : connection ? "Declare Incident" : "Database unavailable"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function normalizeSeverity(severity: string): Severity {
  switch (severity.toLowerCase()) {
    case "critical": return "Critical";
    case "high": return "High";
    case "low": return "Low";
    default: return "Medium";
  }
}

function severityRank(severity: Severity): number {
  switch (severity) {
    case "Low": return 1;
    case "Medium": return 2;
    case "High": return 3;
    case "Critical": return 4;
  }
}

function normalizeStatus(status: string): "Investigating" | "In review" | "Contained" | "Closed" {
  switch (status.toLowerCase()) {
    case "in review": return "In review";
    case "contained": return "Contained";
    case "closed": return "Closed";
    default: return "Investigating";
  }
}
