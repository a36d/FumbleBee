"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { tables } from "@/generated/spacetimedb";
import type { ActivityFeed as LiveActivity, Incident as LiveIncident } from "@/generated/spacetimedb/types";
import { SeverityBadge, StatusBadge } from "@/components/severity-badge";
import { useSpacetimeConnection } from "@/components/spacetime-connection-provider";
import type { Severity } from "@/lib/types";

const riskTone = (score: number) => score >= 85 ? "risk-critical" : score >= 70 ? "risk-high" : score >= 45 ? "risk-medium" : "risk-low";

export function IncidentHub() {
  const router = useRouter();
  const { connection, connectionError } = useSpacetimeConnection();
  const [incidents, setIncidents] = useState<LiveIncident[]>([]);
  const [activities, setActivities] = useState<LiveActivity[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!connection) {
      setIncidents([]);
      setActivities([]);
      return;
    }

    let active = true;
    const refreshIncidents = () => {
      if (!active) return;
      const current = Array.from(connection.db.incident.iter()) as LiveIncident[];
      current.sort((left, right) => Number(right.createdAt.microsSinceUnixEpoch - left.createdAt.microsSinceUnixEpoch));
      setIncidents(current);
    };
    const refreshActivities = () => {
      if (active) setActivities(Array.from(connection.db.activityFeed.iter()) as LiveActivity[]);
    };

    connection.db.incident.onInsert(refreshIncidents);
    connection.db.incident.onUpdate(refreshIncidents);
    connection.db.incident.onDelete(refreshIncidents);
    connection.db.activityFeed.onInsert(refreshActivities);
    connection.db.activityFeed.onUpdate(refreshActivities);
    connection.db.activityFeed.onDelete(refreshActivities);
    const subscription = connection.subscriptionBuilder()
      .onApplied(() => {
        refreshIncidents();
        refreshActivities();
      })
      .onError((context) => {
        if (active) setError(`Could not subscribe to incidents: ${context.event?.message ?? "unknown subscription error"}`);
      })
      .subscribe([tables.incident, tables.activityFeed]);

    return () => {
      active = false;
      connection.db.incident.removeOnInsert(refreshIncidents);
      connection.db.incident.removeOnUpdate(refreshIncidents);
      connection.db.incident.removeOnDelete(refreshIncidents);
      connection.db.activityFeed.removeOnInsert(refreshActivities);
      connection.db.activityFeed.removeOnUpdate(refreshActivities);
      connection.db.activityFeed.removeOnDelete(refreshActivities);
      subscription.unsubscribe();
    };
  }, [connection]);

  const activeIncidents = useMemo(
    () => incidents.filter((incident) => !["closed", "contained"].includes(incident.status.toLowerCase())),
    [incidents],
  );
  const criticalCount = useMemo(
    () => activeIncidents.filter((incident) => incident.severity.toLowerCase() === "critical").length,
    [activeIncidents],
  );
  const lastActivityByIncident = useMemo(() => {
    const latest = new Map<string, bigint>();
    for (const activity of activities) {
      const incidentId = activity.incidentId.toString();
      const current = latest.get(incidentId);
      if (current === undefined || activity.createdAt.microsSinceUnixEpoch > current) {
        latest.set(incidentId, activity.createdAt.microsSinceUnixEpoch);
      }
    }
    return latest;
  }, [activities]);

  async function declareIncident(formData: FormData) {
    if (!connection || creating) return;
    const title = String(formData.get("title") ?? "").trim();
    const subjectName = String(formData.get("subjectName") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const severity = String(formData.get("severity") ?? "Medium") as Severity;
    const triageNotes = String(formData.get("triageNotes") ?? "").trim();
    if (!title || !subjectName || !description) {
      setError("Enter an incident title, subject/account, and description.");
      return;
    }

    const identity = connection.identity;
    if (!identity) {
      setError("SpacetimeDB has not identified this responder. Reconnect and try again.");
      return;
    }

    setCreating(true);
    setError("");
    let timeoutId: number | undefined;
    let removeIncidentListener = () => {};
    const createdIncident = new Promise<LiveIncident>((resolve, reject) => {
      const matchCreatedIncident = (_context: unknown, row: LiveIncident) => {
        if (
          row.createdBy.isEqual(identity) &&
          row.title === title &&
          row.subjectName === subjectName &&
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
        subjectName,
        status: "Investigating",
        severity,
      });
      const created = await createdIncident;
      if (triageNotes) {
        await connection.reducers.addInvestigationNote({ incidentId: created.id, content: triageNotes });
      }
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
          <div className="eyebrow"><span className="eyebrow-line" /> SOVEREIGN RESPONSE ENVIRONMENT</div>
          <h1>FumbleBee Incident Command Hub</h1>
          <p>Live incident operations across your organization.</p>
        </div>
        <div className="incident-hub-metrics">
          <div className="hub-metric-chip"><span>Total Active Incidents</span><strong>{activeIncidents.length}</strong></div>
          <div className="hub-metric-chip hub-critical-chip"><span>Critical Severity</span><strong>{criticalCount}</strong></div>
          <div className="hub-metric-chip hub-health-chip"><span>System Health</span><strong>Sovereign / Air-Gapped</strong></div>
        </div>
      </section>

      <div className="page-heading incident-list-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> INCIDENT OPERATIONS</div>
          <h2>All incidents</h2>
          <p className="page-subtitle">Monitor severity, risk, and investigation status in real time.</p>
        </div>
        <button className="button button-primary" onClick={() => { setError(""); setCreateOpen(true); }} disabled={!connection}>
          <Plus size={15} /> Declare New Incident
        </button>
      </div>

      {(error || connectionError) && <p className="analysis-error" role="alert">{error || connectionError}</p>}

      <section className="panel incident-hub-panel">
        <div className="panel-heading">
          <div><div className="section-title-row"><h2>Incident register</h2><span className="count-pill">{incidents.length}</span></div><p>Subscribed directly from the live SpacetimeDB incident table.</p></div>
          <Link className="hub-overview-link" href="/">Security overview</Link>
        </div>
        {incidents.length ? (
          <div className="table-wrap">
            <table className="incident-hub-table">
              <thead><tr><th>INCIDENT</th><th>SEVERITY</th><th>RISK SCORE</th><th>CLASSIFICATION</th><th>STATUS</th><th>LAST UPDATED</th><th /></tr></thead>
              <tbody>
                {incidents.map((incident) => {
                  const riskScore = Number(incident.riskScore);
                  const updatedAt = new Date(Number((lastActivityByIncident.get(incident.id.toString()) ?? incident.createdAt.microsSinceUnixEpoch) / 1000n));
                  return (
                    <tr key={String(incident.id)}>
                      <td><Link className="hub-incident-title" href={`/investigations/${incident.id}`}><span>#{incident.id.toString()}</span>{incident.title}</Link><small className="hub-incident-subject">{incident.subjectName}</small></td>
                      <td><SeverityBadge severity={normalizeSeverity(incident.severity)} /></td>
                      <td><div className="hub-risk-meter"><span className={`risk-score ${riskTone(riskScore)}`}>{riskScore}<small>/100</small></span><i><span className={riskTone(riskScore)} style={{ width: `${Math.min(100, Math.max(0, riskScore))}%` }} /></i></div></td>
                      <td><span className="hub-classification">{incident.classification || "Pending Analysis"}</span></td>
                      <td><StatusBadge status={normalizeStatus(incident.status)} /></td>
                      <td className="created-cell">{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(updatedAt)}</td>
                      <td><Link className="row-action" href={`/investigations/${incident.id}`} aria-label={`Open incident ${incident.id}`}><ArrowRight size={16} /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="incident-hub-empty">
            <strong>{connection ? "No incidents are available." : "Connecting to the incident register..."}</strong>
            <span>{connection ? "Declare a new incident to begin a live investigation." : connectionError || "Waiting for the SpacetimeDB connection."}</span>
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
            <form action={declareIncident} className="modal-form">
              <label>Incident Title<input name="title" placeholder="e.g. Unusual bulk data access" required /></label>
              <label>Subject / Account<input name="subjectName" placeholder="Person, service, or account" required /></label>
              <label>Description<textarea name="description" rows={3} placeholder="Summarize the observed incident and context." required /></label>
              <label>Severity<select name="severity" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
              <label>Initial Forensic Triage Notes<textarea name="triageNotes" rows={3} placeholder="Evidence handling, initial findings, or collection instructions." /></label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={creating || !connection}>{creating ? "Declaring incident..." : "Declare Incident"}</button>
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

function normalizeStatus(status: string): "Investigating" | "In review" | "Contained" | "Closed" {
  switch (status.toLowerCase()) {
    case "in review": return "In review";
    case "contained": return "Contained";
    case "closed": return "Closed";
    default: return "Investigating";
  }
}
