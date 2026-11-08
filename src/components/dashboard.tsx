"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowRight, X } from "lucide-react";
import { incidents } from "@/lib/mock-data";
import type { Incident, Severity } from "@/lib/types";
import { MetricCard } from "@/components/metric-card";
import { SeverityBadge, StatusBadge } from "@/components/severity-badge";

const riskTone = (score: number) => score >= 85 ? "risk-critical" : score >= 70 ? "risk-high" : score >= 45 ? "risk-medium" : "risk-low";

export function Dashboard() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [localIncidents, setLocalIncidents] = useState(incidents);
  const filtered = localIncidents.filter((incident) => `${incident.id} ${incident.title} ${incident.subjectName}`.toLowerCase().includes(query.toLowerCase()));

  function createIncident(formData: FormData) {
    const title = String(formData.get("title") || "").trim();
    const subjectName = String(formData.get("subjectName") || "").trim();
    if (!title || !subjectName) return;
    const newIncident: Incident = {
      id: `INC-2024-${String(848 + localIncidents.length - incidents.length).padStart(4, "0")}`,
      title,
      subjectName,
      description: String(formData.get("description") || ""),
      triggerDetails: String(formData.get("triggerDetails") || ""),
      severity: "Medium" as Severity,
      riskScore: 50,
      status: "Investigating",
      createdAt: new Date().toISOString(),
      threatClassification: "Pending analysis",
      blastRadius: 0,
      impactSummary: "Analysis has not yet been run.",
      recommendations: [],
      confidence: 0,
    };
    setLocalIncidents((current) => [newIncident, ...current]);
    setDialogOpen(false);
  }

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> MONDAY, NOVEMBER 18, 2024</div><h1>Security overview</h1><p className="page-subtitle">Monitor and investigate insider threat activity across your organization.</p></div>
        <button className="button button-primary" onClick={() => setDialogOpen(true)}>New investigation</button>
      </div>
      <div className="metric-grid">
        <MetricCard label="Active investigations" value="12" change="+2" changeLabel="vs. last week" />
        <MetricCard label="High-risk users" value="08" change="+1" changeLabel="vs. last week" />
        <MetricCard label="Assets at risk" value="24" change="+4" changeLabel="vs. last week" />
        <MetricCard label="Recent alerts" value="36" change="-12%" changeLabel="vs. last week" />
      </div>

      <section className="panel investigations-panel">
        <div className="panel-heading">
          <div><div className="section-title-row"><h2>Investigations</h2><span className="count-pill">{localIncidents.length}</span></div><p>Review and manage active threat investigations</p></div>
          <div className="table-actions"><label className="table-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search investigations..." /></label><button className="button button-secondary filter-button">All severity <ArrowDown size={13} /></button></div>
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
          {filtered.length === 0 && <div className="empty-state">No investigations match “{query}”.</div>}
        </div>
        <div className="table-footer"><span>Showing <strong>{filtered.length}</strong> of <strong>{localIncidents.length}</strong> investigations</span><button>View all investigations</button></div>
      </section>
      <div className="dashboard-bottom">
        <section className="panel mini-panel"><div className="mini-title"><div><h3>Threat activity</h3><span>Last 7 days</span></div></div><div className="activity-chart" aria-label="Threat activity trend chart"><div className="chart-y-labels"><span>40</span><span>20</span><span>0</span></div><div className="chart-plot"><div className="chart-gridline one" /><div className="chart-gridline two" /><div className="chart-bars">{[28, 42, 33, 61, 48, 77, 58, 84, 55, 70, 93, 65, 74, 46, 81, 57, 68, 87].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="chart-days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div></div></section>
        <section className="panel mini-panel alert-panel"><div className="mini-title"><div><h3>Needs your attention</h3><span>Priority follow-ups</span></div></div><Link href="/investigations/1" className="attention-item"><span className="attention-dot" /><span><strong>Bulk access and privilege escalation</strong><small>svc-prod-data-pipeline · Investigating</small></span></Link><Link href="/investigations/INC-2024-0846" className="attention-item"><span className="attention-dot attention-amber" /><span><strong>Credential review required</strong><small>Taylor Brooks · 38 min ago</small></span></Link></section>
      </div>
      {dialogOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-investigation-title"><div className="modal-heading"><div><h2 id="new-investigation-title">New investigation</h2><p>Create an investigation to start tracking a potential threat.</p></div><button className="icon-button" onClick={() => setDialogOpen(false)} aria-label="Close dialog"><X size={18} /></button></div><form action={createIncident} className="modal-form"><label>Investigation title<input name="title" placeholder="e.g. Unusual data access" required /></label><label>Subject name<input name="subjectName" placeholder="Employee or account name" required /></label><label>Description<textarea name="description" rows={3} placeholder="What happened? Include any relevant context." /></label><label>Trigger details<textarea name="triggerDetails" rows={2} placeholder="Alert source, observed behavior, or detection signal" /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setDialogOpen(false)}>Cancel</button><button className="button button-primary" type="submit">Create investigation</button></div></form></section></div>}
    </>
  );
}
