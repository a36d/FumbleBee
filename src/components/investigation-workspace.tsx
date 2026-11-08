"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, ArrowUpRight, Check, CheckCircle2, Clock3, FileClock, Fingerprint, LoaderCircle, LockKeyhole, Plus, Shield, Sparkles } from "lucide-react";
import Link from "next/link";
import { formatAttackGraph, type AiAnalysisInput } from "@/sdk/src/index";
import { activity as initialActivity, assets, auditLogs, incidents, notes as initialNotes, relationships, relativeTime, seededIncidentAssets, seededIncidentRelationships } from "@/lib/mock-data";
import { getAttackPathLayout } from "@/lib/graph-layout";
import type { ActivityFeed, InvestigationNote } from "@/lib/types";
import { AttackGraph } from "@/components/attack-graph";
import { SeverityBadge, StatusBadge } from "@/components/severity-badge";

const activityIcon = { incident: Shield, note: Plus, analysis: Sparkles, risk: AlertTriangle, graph: Activity };

export function InvestigationWorkspace({ incidentId }: { incidentId: string }) {
  const incident = useMemo(() => incidents.find((item) => item.id === incidentId) ?? incidents[0], [incidentId]);
  const [notes, setNotes] = useState(initialNotes.filter((note) => note.incidentId === incident.id));
  const [events, setEvents] = useState(initialActivity.filter((item) => item.incidentId === incident.id));
  const [noteText, setNoteText] = useState("");
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AiAnalysisInput | null>(null);
  const [graph, setGraph] = useState(() => {
    const graphAssets = incident.id === "1" ? seededIncidentAssets : assets;
    const graphRelationships = incident.id === "1" ? seededIncidentRelationships : relationships;
    const formattedGraph = formatAttackGraph(graphAssets, graphRelationships);
    return getAttackPathLayout(formattedGraph.nodes, formattedGraph.edges);
  });
  const [auditOpen, setAuditOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);

  async function runAnalysis() {
    if (analysisRunning) return;
    setAnalysisRunning(true);
    setAnalysisError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: incident.title,
          description: incident.description,
          notes: notes.map((note) => note.content),
        }),
      });
      const result = await response.json() as {
        analysis?: AiAnalysisInput;
        source?: "nemotron" | "mock";
        error?: string;
      };
      if (!response.ok || !result.analysis) {
        throw new Error(result.error ?? "Analysis could not be completed.");
      }

      const { analysis } = result;
      const formattedGraph = formatAttackGraph(analysis.assets, analysis.edges);
      setGraph(getAttackPathLayout(formattedGraph.nodes, formattedGraph.edges));
      setAnalysisResult(analysis);
      const event: ActivityFeed = { id: `analysis-${Date.now()}`, incidentId: incident.id, action: "AI analysis completed", actor: "SentinelGraph AI", createdAt: new Date().toISOString(), kind: "analysis" };
      setEvents((current) => [event, ...current]);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Analysis could not be completed.");
    } finally {
      setAnalysisRunning(false);
    }
  }

  const findings = {
    threatClassification: analysisResult?.threatClassification ?? incident.threatClassification,
    riskScore: analysisResult?.riskScore ?? incident.riskScore,
    severity: analysisResult?.severity ?? incident.severity,
    blastRadius: analysisResult?.blastRadius ?? incident.blastRadius,
    confidence: analysisResult?.confidence ?? incident.confidence,
    impactSummary: analysisResult?.impactSummary ?? incident.impactSummary,
    recommendations: analysisResult?.recommendations ?? incident.recommendations,
  };

  function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = noteText.trim();
    if (!content) return;
    const note: InvestigationNote = { id: `note-${Date.now()}`, incidentId: incident.id, author: "Alex Morgan", initials: "AM", content, createdAt: new Date().toISOString() };
    const feedEvent: ActivityFeed = { id: `note-event-${Date.now()}`, incidentId: incident.id, action: "Investigation note added", actor: note.author, createdAt: note.createdAt, kind: "note" };
    setNotes((current) => [note, ...current]);
    setEvents((current) => [feedEvent, ...current]);
    setNoteText("");
  }

  return (
    <>
      <div className="investigation-heading">
        <div><Link href="/" className="back-link"><ArrowLeft size={14} /> All investigations</Link><div className="investigation-title-row"><h1>{incident.title}</h1><SeverityBadge severity={findings.severity} /></div><div className="investigation-meta"><span>{incident.id}</span><span className="meta-dot">·</span><span>Subject: <strong>{incident.subjectName}</strong></span><span className="meta-dot">·</span><StatusBadge status={incident.status} /></div></div>
        <div className="heading-actions"><button className="button button-secondary" onClick={() => setAuditOpen(true)}><Fingerprint size={16} /> Audit trail</button><button className="button button-primary" onClick={runAnalysis} disabled={analysisRunning}>{analysisRunning ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{analysisRunning ? "Analyzing..." : "Run AI analysis"}</button></div>
      </div>
      {analysisError && <p className="analysis-error" role="alert">{analysisError}</p>}

      <div className="investigation-summary panel">
        <div className="summary-score"><div className="score-gauge" style={{ "--score": `${findings.riskScore}%` } as React.CSSProperties}><span>{findings.riskScore}</span><small>RISK</small></div><div><span className="summary-label">RISK SCORE</span><strong className="summary-score-text">{findings.severity} risk detected</strong><small>Updated {analysisResult ? "just now" : "12 minutes ago"}</small></div></div>
        <div className="summary-separator" /><div className="summary-stat"><span className="summary-label">THREAT CLASSIFICATION</span><strong><span className="classification-icon"><AlertTriangle size={14} /></span>{findings.threatClassification}</strong><small>Confidence {findings.confidence}%</small></div>
        <div className="summary-separator" /><div className="summary-stat"><span className="summary-label">BLAST RADIUS</span><strong className="blast-number">{findings.blastRadius} <small>assets</small></strong><small>Across connected systems</small></div>
        <div className="summary-separator" /><div className="summary-stat"><span className="summary-label">CREATED</span><strong>{relativeTime(incident.createdAt)}</strong><small>By detection engine</small></div>
      </div>

      <div className="investigation-layout">
        <div className="investigation-left">
          <section className="panel graph-panel">
            <div className="panel-heading graph-heading"><div><div className="section-title-row"><span className="panel-heading-icon"><Activity size={16} /></span><h2>Attack path</h2><span className="ai-generated"><Sparkles size={11} /> AI GENERATED</span></div><p>Observed entity relationships and potential data exposure path</p></div><button className="button button-quiet" onClick={() => setAuditOpen(true)}><LockKeyhole size={14} /> Evidence log</button></div>
            <AttackGraph nodes={graph.nodes} edges={graph.edges} />
            <div className="graph-footnote"><span><i className="graph-foot-dot" /> Path confidence <strong>{findings.confidence}%</strong></span><span>{analysisResult ? "Generated just now" : "Seeded investigation path"}</span></div>
          </section>
          <section className="panel impact-panel"><div className="panel-heading"><div><div className="section-title-row"><span className="panel-heading-icon panel-icon-rose"><AlertTriangle size={16} /></span><h2>Impact summary</h2></div></div><span className="impact-tag">{findings.severity.toUpperCase()} IMPACT</span></div><p>{findings.impactSummary} Activity spans <strong>{findings.blastRadius} connected assets</strong>.</p><div className="impact-tags"><span><DatabaseIcon /> Customer records</span><span><CodeIcon /> Source code</span><span><LockKeyhole size={12} /> Restricted share</span></div></section>
        </div>

        <div className="investigation-right">
          <section className="panel findings-panel">
            <div className="panel-heading findings-heading"><div><div className="section-title-row"><span className="panel-heading-icon panel-icon-violet"><Sparkles size={16} /></span><h2>AI findings</h2></div><p>Nemotron-powered investigation insights</p></div><span className="confidence-chip"><span />{findings.confidence}% confidence</span></div>
            <div className="finding-classification"><span className="summary-label">CLASSIFICATION</span><div><span className="classification-icon"><AlertTriangle size={14} /></span><strong>{findings.threatClassification}</strong><span className="finding-severity">{findings.severity}</span></div></div>
            <div className="finding-blast"><div><span className="summary-label">ESTIMATED BLAST RADIUS</span><small>Potentially affected assets</small></div><strong>{findings.blastRadius}<span> assets</span></strong></div>
            <div className="finding-summary"><span className="summary-label">IMPACT SUMMARY</span><p>{findings.impactSummary}</p></div>
            <div className="recommendations"><span className="summary-label">RECOMMENDED ACTIONS</span>{findings.recommendations.map((recommendation, index) => {
              const isChecked = checked.includes(recommendation);
              return <button className={`recommendation ${isChecked ? "recommendation-done" : ""}`} key={recommendation} onClick={() => setChecked((current) => isChecked ? current.filter((value) => value !== recommendation) : [...current, recommendation])}><span className="recommendation-check">{isChecked ? <Check size={12} /> : index + 1}</span><span>{recommendation}</span><span className={`action-priority ${index === 0 ? "priority-immediate" : ""}`}>{index === 0 ? "Immediate" : "Recommended"}</span></button>;
            })}</div>
            <button className="text-action" onClick={runAnalysis}><Sparkles size={13} /> {analysisRunning ? "Analysis in progress..." : "Refresh AI analysis"} <ArrowUpRight size={13} /></button>
          </section>

          <section className="panel notes-panel">
            <div className="panel-heading compact-heading"><div><div className="section-title-row"><span className="panel-heading-icon panel-icon-blue"><FileClock size={15} /></span><h2>Investigation notes</h2><span className="count-pill">{notes.length}</span></div></div><button className="small-icon-button" aria-label="More note options">···</button></div>
            <div className="notes-list">{notes.map((note) => <article className="note-item" key={note.id}><span className={`avatar note-avatar ${note.initials === "AM" ? "avatar-blue" : "avatar-note"}`}>{note.initials}</span><div className="note-content"><div className="note-author"><strong>{note.author}</strong><time>{relativeTime(note.createdAt)}</time></div><p>{note.content}</p></div></article>)}</div>
            <form className="note-form" onSubmit={addNote}><span className="avatar avatar-blue note-avatar">AM</span><div className="note-input-wrap"><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Add an investigation note..." rows={2} /><div className="note-submit-row"><span>Visible to investigation team</span><button type="submit" className="button button-primary button-small" disabled={!noteText.trim()}><Plus size={13} /> Add note</button></div></div></form>
          </section>

          <section className="panel activity-panel" id="activity">
            <div className="panel-heading compact-heading"><div><div className="section-title-row"><span className="panel-heading-icon panel-icon-mint"><Activity size={15} /></span><h2>Activity</h2></div><p>Investigation timeline</p></div><button className="small-icon-button" aria-label="More activity options">···</button></div>
            <div className="timeline">{events.map((item, index) => { const Icon = activityIcon[item.kind]; return <article className="timeline-item" key={item.id}><span className={`timeline-icon timeline-${item.kind}`}><Icon size={12} /></span>{index < events.length - 1 && <span className="timeline-line" />}<div><p>{item.action}</p><small>{item.actor}<span>·</span>{relativeTime(item.createdAt)}</small></div></article>; })}</div>
          </section>
        </div>
      </div>

      {auditOpen && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuditOpen(false); }}><aside className="audit-drawer" role="dialog" aria-modal="true" aria-labelledby="audit-title"><div className="drawer-header"><div><div className="drawer-kicker"><span className="status-dot" /> TAMPER-EVIDENT RECORD</div><h2 id="audit-title">Audit trail</h2><p>Cryptographically linked investigation events.</p></div><button className="icon-button" onClick={() => setAuditOpen(false)} aria-label="Close audit trail">×</button></div><div className="chain-status"><CheckCircle2 size={16} /><span><strong>Chain integrity verified</strong><small>All {auditLogs.length} entries are linked and unmodified</small></span><Check size={14} /></div><div className="audit-list">{auditLogs.map((log) => <article className="audit-entry" key={log.id}><div className="audit-entry-heading"><span className="audit-sequence">#{String(log.sequence).padStart(4, "0")}</span><span className="audit-time"><Clock3 size={12} />{relativeTime(log.timestamp)}</span></div><h3>{log.action}</h3><span className="audit-actor">by <strong>{log.actor}</strong></span><div className="hash-row"><span>PREVIOUS HASH</span><code>{log.previousHash}</code></div><div className="hash-row"><span>CURRENT HASH</span><code>{log.currentHash}</code></div></article>)}</div><div className="drawer-footer"><Fingerprint size={15} /><span>SHA-256 · Append-only event chain</span><button onClick={() => setAuditOpen(false)}>Done</button></div></aside></div>}
    </>
  );
}

function DatabaseIcon() { return <span className="tiny-db">DB</span>; }
function CodeIcon() { return <span className="tiny-code">&lt;/&gt;</span>; }
