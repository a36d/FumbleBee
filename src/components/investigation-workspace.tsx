"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import type { Node } from "@xyflow/react";
import { createSentinelGraphClient, formatAttackGraph, type AiAnalysisInput } from "@/sdk/src/index";
import {
  tables,
} from "@/generated/spacetimedb";
import type { ActivityFeed as LiveActivity, Asset as LiveAsset, AuditLog as LiveAuditLog, Incident as LiveIncident, InvestigationNote as LiveNote, Relationship as LiveRelationship } from "@/generated/spacetimedb/types";
import { activity as initialActivity, assets, auditLogs, incidents, notes as initialNotes, relationships, relativeTime, seededIncidentAssets, seededIncidentRelationships } from "@/lib/mock-data";
import { getAttackPathLayout } from "@/lib/graph-layout";
import type { ActivityFeed, Asset as FrontendAsset, AssetScopeStatus, Incident as FrontendIncident, InvestigationNote, Relationship as FrontendRelationship } from "@/lib/types";
import { AttackGraph } from "@/components/attack-graph";
import { AuditFeedPanel, type AuditFeedActivity, type AuditFeedEntry } from "@/components/audit-feed-panel";
import { SeverityBadge, StatusBadge } from "@/components/severity-badge";
import { useSpacetimeConnection } from "@/components/spacetime-connection-provider";

export function InvestigationWorkspace({ incidentId }: { incidentId: string }) {
  const { connection } = useSpacetimeConnection();
  const fallbackIncident = useMemo(() => incidents.find((item) => item.id === incidentId) ?? incidents[0], [incidentId]);
  const [liveIncident, setLiveIncident] = useState<FrontendIncident | null>(null);
  const incident = liveIncident ?? fallbackIncident;
  const [notes, setNotes] = useState(initialNotes.filter((note) => note.incidentId === incident.id));
  const [events, setEvents] = useState(initialActivity.filter((item) => item.incidentId === incident.id));
  const [liveActivities, setLiveActivities] = useState<AuditFeedActivity[]>([]);
  const [liveAuditEntries, setLiveAuditEntries] = useState<AuditFeedEntry[]>([]);
  const [noteText, setNoteText] = useState("");
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [assetActionPending, setAssetActionPending] = useState(false);
  const [exportFormat, setExportFormat] = useState<"markdown" | "json">("markdown");
  const [exportRunning, setExportRunning] = useState(false);
  const [exportError, setExportError] = useState("");
  const [resetRunning, setResetRunning] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AiAnalysisInput | null>(null);
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<FrontendAsset | null>(null);
  const assetScopesRef = useRef<Record<string, AssetScopeStatus>>({});
  const [assetScopes, setAssetScopes] = useState<Record<string, AssetScopeStatus>>({});
  const [graph, setGraph] = useState(() => {
    const graphAssets = incident.id === "1" ? seededIncidentAssets : assets;
    const graphRelationships = incident.id === "1" ? seededIncidentRelationships : relationships;
    const formattedGraph = formatAttackGraph(graphAssets, graphRelationships);
    return getAttackPathLayout(formattedGraph.nodes, formattedGraph.edges);
  });
  const [auditOpen, setAuditOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [sentinelClient, setSentinelClient] = useState<ReturnType<typeof createSentinelGraphClient> | null>(null);

  function applyAssetScopes(nodes: Node[]) {
    return nodes.map((node) => {
      const asset = node.data.asset as FrontendAsset | undefined;
      const scopeStatus = asset ? assetScopesRef.current[asset.id] : undefined;
      return scopeStatus
        ? { ...node, data: { ...node.data, asset: { ...asset, scopeStatus } } }
        : node;
    });
  }

  async function exportForensicReport() {
    if (exportRunning) return;
    setExportRunning(true);
    setExportError("");
    try {
      const format = exportFormat === "json" ? "json" : "markdown";
      const response = await fetch(`/api/incidents/${encodeURIComponent(incidentId)}/export?format=${format}`);
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "Forensic report export failed.");
      }

      const report = await response.blob();
      const objectUrl = URL.createObjectURL(report);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `incident-${incidentId}-forensic-report.${format === "json" ? "json" : "md"}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Forensic report export failed.");
    } finally {
      setExportRunning(false);
    }
  }

  async function resetDemoState() {
    if (resetRunning || !window.confirm("Reset Incident #1 to its pre-analysis demo state?")) return;
    setResetRunning(true);
    setAnalysisError("");
    setResetNotice("");
    try {
      const response = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json() as { success?: boolean; error?: string; message?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Demo state reset failed.");
      }

      setGraph({ nodes: [], edges: [] });
      setAnalysisResult(null);
      setSelectedAsset(null);
      assetScopesRef.current = {};
      setAssetScopes({});
      setHighRiskOnly(false);
      setChecked([]);
      setLiveIncident((current) => ({
        ...(current ?? fallbackIncident),
        severity: "High",
        riskScore: 0,
        threatClassification: "Pending Analysis",
        blastRadius: 0,
        impactSummary: "",
        recommendations: [],
        confidence: 0,
      }));
      setResetNotice(result.message ?? "Incident state reset.");
      window.setTimeout(() => setResetNotice(""), 3500);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Demo state reset failed.");
    } finally {
      setResetRunning(false);
    }
  }

  useEffect(() => {
    if (!connection) return;
    const refreshIncidentAndGraph = () => {
      const incidentRows = Array.from(connection.db.incident.iter()) as LiveIncident[];
      const liveRow = incidentRows.find((row) => row.id === 1n);
      if (liveRow) {
        let recommendations: string[] = [];
        try {
          recommendations = JSON.parse(liveRow.recommendations || "[]");
        } catch {
          recommendations = [];
        }

        setLiveIncident({
          id: liveRow.id.toString(),
          subjectName: liveRow.subjectName,
          title: liveRow.title,
          description: liveRow.description,
          triggerDetails: liveRow.triggerDetails || fallbackIncident.triggerDetails,
          severity: liveRow.severity as FrontendIncident["severity"],
          riskScore: liveRow.riskScore,
          status: liveRow.status as FrontendIncident["status"],
          createdAt: new Date(Number(liveRow.createdAt.microsSinceUnixEpoch / 1000n)).toISOString(),
          threatClassification: liveRow.classification || "Pending Analysis",
          blastRadius: liveRow.blastRadius ?? 0,
          impactSummary: liveRow.impactSummary || fallbackIncident.impactSummary,
          recommendations,
          confidence: liveRow.confidence ?? 0,
        });
      }

      const liveNotes = (Array.from(connection.db.investigationNote.iter()) as LiveNote[])
        .filter((row) => row.incidentId === 1n)
        .map((row) => ({
          id: row.id.toString(),
          incidentId: row.incidentId.toString(),
          author: row.authorName,
          initials: row.authorName
            .split(/\s+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
          content: row.content,
          createdAt: new Date(Number(row.createdAt.microsSinceUnixEpoch / 1000n)).toISOString(),
        }));
      if (liveNotes.length > 0) {
        setNotes(liveNotes);
      }

      const currentActivities = (Array.from(connection.db.activityFeed.iter()) as LiveActivity[])
        .filter((row) => row.incidentId === 1n)
        .map((row): AuditFeedActivity => ({
          id: row.id,
          actorName: row.actorName,
          action: row.action,
          createdAt: new Date(Number(row.createdAt.microsSinceUnixEpoch / 1000n)),
        }));
      setLiveActivities(currentActivities);

      const currentAuditEntries = (Array.from(connection.db.auditLog.iter()) as LiveAuditLog[])
        .map((row): AuditFeedEntry => ({
          sequenceId: row.sequenceId,
          action: row.action,
          timestamp: new Date(Number(row.timestamp.microsSinceUnixEpoch / 1000n)),
          timestampMicros: row.timestamp.microsSinceUnixEpoch.toString(),
          actorIdentity: row.actorIdentity.toHexString(),
          incidentId: row.incidentId == null ? null : row.incidentId.toString(),
          currentHash: row.currentHash,
          previousHash: row.previousHash,
        }));
      setLiveAuditEntries(currentAuditEntries);

      const liveAssets = (Array.from(connection.db.asset.iter()) as LiveAsset[])
        .filter((row) => row.incidentId === 1n)
        .map((row): FrontendAsset => {
          const scopeStatus = toAssetScopeStatus(row.compromiseStatus);
          return {
            id: row.assetKey || row.id.toString(),
            databaseId: row.id,
            name: row.name,
            type: row.assetType as FrontendAsset["type"],
            description: row.description || "",
            riskLabel: row.riskLevel,
            scopeStatus,
          };
        });
      const liveScopes = Object.fromEntries(liveAssets
        .filter((asset): asset is FrontendAsset & { scopeStatus: AssetScopeStatus } => asset.scopeStatus !== undefined)
        .map((asset) => [asset.id, asset.scopeStatus]));
      assetScopesRef.current = { ...assetScopesRef.current, ...liveScopes };
      setAssetScopes((current) => ({ ...current, ...liveScopes }));
      setSelectedAsset((current) => current
        ? liveAssets.find((asset) => asset.id === current.id) ?? current
        : null);

      const liveRelationships = (Array.from(connection.db.relationship.iter()) as LiveRelationship[])
        .filter((row) => row.incidentId === 1n)
        .map((row): FrontendRelationship => ({
          id: row.id.toString(),
          sourceId: row.sourceAssetKey,
          targetId: row.targetAssetKey,
          label: row.relationLabel,
        }));

      if (liveAssets.length > 0 || liveRelationships.length > 0) {
        const formattedGraph = formatAttackGraph(liveAssets, liveRelationships);
        setGraph(getAttackPathLayout(applyAssetScopes(formattedGraph.nodes), formattedGraph.edges));
      }
    };

    const subscription = connection.subscriptionBuilder()
      .onApplied(refreshIncidentAndGraph)
      .onError((context) => setAnalysisError(`Live SpacetimeDB subscription failed: ${context.event?.message ?? "unknown subscription error"}`))
      .subscribe([
        tables.incident,
        tables.investigationNote,
        tables.asset,
        tables.relationship,
        tables.activityFeed,
        tables.auditLog,
      ]);

    const refreshOnTableChange = () => refreshIncidentAndGraph();
    connection.db.incident.onInsert(refreshOnTableChange);
    connection.db.incident.onUpdate(refreshOnTableChange);
    connection.db.incident.onDelete(refreshOnTableChange);
    connection.db.investigationNote.onInsert(refreshOnTableChange);
    connection.db.investigationNote.onUpdate(refreshOnTableChange);
    connection.db.investigationNote.onDelete(refreshOnTableChange);
    connection.db.asset.onInsert(refreshOnTableChange);
    connection.db.asset.onUpdate(refreshOnTableChange);
    connection.db.asset.onDelete(refreshOnTableChange);
    connection.db.relationship.onInsert(refreshOnTableChange);
    connection.db.relationship.onUpdate(refreshOnTableChange);
    connection.db.relationship.onDelete(refreshOnTableChange);
    connection.db.activityFeed.onInsert(refreshOnTableChange);
    connection.db.activityFeed.onUpdate(refreshOnTableChange);
    connection.db.activityFeed.onDelete(refreshOnTableChange);
    connection.db.auditLog.onInsert(refreshOnTableChange);
    connection.db.auditLog.onUpdate(refreshOnTableChange);
    connection.db.auditLog.onDelete(refreshOnTableChange);

    const client = createSentinelGraphClient({
      host: "http://localhost:3000",
      databaseName: "sentinelgraph",
      transport: {
        reducer: {
          call: (_name, args) => {
            if (_name === "applyAiAnalysis") {
              const reducers = connection.reducers as unknown as {
                applyAiAnalysis: (args: Record<string, unknown>) => void;
              };
              void reducers.applyAiAnalysis(args);
              return;
            }
            const reducers = connection.reducers as unknown as Record<string, (args: Record<string, unknown>) => void>;
            void reducers[_name]?.(args);
          },
        },
      },
    });
    setSentinelClient(client);

    return () => {
      if (connection) {
        subscription.unsubscribe();
        connection.db.incident.removeOnInsert(refreshOnTableChange);
        connection.db.incident.removeOnUpdate(refreshOnTableChange);
        connection.db.incident.removeOnDelete(refreshOnTableChange);
        connection.db.investigationNote.removeOnInsert(refreshOnTableChange);
        connection.db.investigationNote.removeOnUpdate(refreshOnTableChange);
        connection.db.investigationNote.removeOnDelete(refreshOnTableChange);
        connection.db.asset.removeOnInsert(refreshOnTableChange);
        connection.db.asset.removeOnUpdate(refreshOnTableChange);
        connection.db.asset.removeOnDelete(refreshOnTableChange);
        connection.db.relationship.removeOnInsert(refreshOnTableChange);
        connection.db.relationship.removeOnUpdate(refreshOnTableChange);
        connection.db.relationship.removeOnDelete(refreshOnTableChange);
        connection.db.activityFeed.removeOnInsert(refreshOnTableChange);
        connection.db.activityFeed.removeOnUpdate(refreshOnTableChange);
        connection.db.activityFeed.removeOnDelete(refreshOnTableChange);
        connection.db.auditLog.removeOnInsert(refreshOnTableChange);
        connection.db.auditLog.removeOnUpdate(refreshOnTableChange);
        connection.db.auditLog.removeOnDelete(refreshOnTableChange);
      }
    };
  }, [connection, fallbackIncident]);

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
      if (!sentinelClient) {
        throw new Error("SpacetimeDB client is not connected.");
      }
      await sentinelClient.applyAiAnalysis(1n, {
        ...analysis,
      });
      const formattedGraph = formatAttackGraph(analysis.assets, analysis.edges);
      setGraph(getAttackPathLayout(applyAssetScopes(formattedGraph.nodes), formattedGraph.edges));
      setAnalysisResult(analysis);
      const event: ActivityFeed = { id: `analysis-${Date.now()}`, incidentId: incident.id, action: "AI analysis completed", actor: "FumbleBee AI", createdAt: new Date().toISOString(), kind: "analysis" };
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

  const selectedAssetSeverity = getAssetSeverity(selectedAsset?.riskLabel, findings.severity);
  const selectedAssetScope = selectedAsset
    ? assetScopes[selectedAsset.id] ?? selectedAsset.scopeStatus ?? "Targeted"
    : "Targeted";
  const selectedAssetRiskScore = selectedAsset
    ? selectedAsset.type === "identity"
      ? findings.riskScore
      : getAssetRiskScore(selectedAssetSeverity)
    : 0;
  const selectedAssetRecommendations = selectedAsset
    ? getAssetRecommendations(selectedAsset, findings.recommendations)
    : [];

  function handleGraphNodeClick(_event: React.MouseEvent, node: Node) {
    const asset = node.data.asset as FrontendAsset | undefined;
    if (asset) setSelectedAsset(asset);
  }

  async function updateAssetScope(scopeStatus: AssetScopeStatus) {
    if (!selectedAsset) return;
    if (!connection || selectedAsset.databaseId === undefined) {
      setAnalysisError("This asset is not connected to a SpacetimeDB record, so its status cannot be updated.");
      return;
    }

    setAssetActionPending(true);
    setAnalysisError("");
    try {
      await connection.reducers.updateAssetCompromiseStatus({
        assetId: selectedAsset.databaseId,
        compromiseStatus: toReducerCompromiseStatus(scopeStatus),
      });
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Asset compromise status update failed.");
    } finally {
      setAssetActionPending(false);
    }
  }

  async function executeContainment() {
    if (!selectedAsset) return;
    if (!connection || selectedAsset.databaseId === undefined) {
      setAnalysisError("This asset is not connected to a SpacetimeDB record, so containment cannot be applied.");
      return;
    }

    setAssetActionPending(true);
    setAnalysisError("");
    const actionType = getContainmentActionType(selectedAsset.type);
    const mitigationDetails = `${getContainmentAction(selectedAsset.type)} requested for ${selectedAsset.name}. FumbleBee records the action; no infrastructure adapter is configured.`;
    try {
      await connection.reducers.applyAssetContainment({
        assetId: selectedAsset.databaseId,
        actionType,
        mitigationDetails,
      });
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Asset containment failed.");
    } finally {
      setAssetActionPending(false);
    }
  }

  const panelActivities = useMemo(() => {
    const workspaceActivities = events.map((item) => ({
        id: item.id,
        actorName: item.actor,
        action: item.action,
        createdAt: item.createdAt,
      }));
    const uniqueActivities = new Map(
      [...workspaceActivities, ...liveActivities].map((item) => [
        `${item.action}:${item.actorName}:${new Date(item.createdAt).getTime()}`,
        item,
      ]),
    );
    return [...uniqueActivities.values()];
  }, [events, liveActivities]);

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
        <div className="investigation-title-panel">
          <div className="investigation-heading-copy">
            <div className="eyebrow"><span className="eyebrow-line" /><Link href="/incidents" className="heading-back-link">Incident Command Hub</Link><span className="meta-dot">/</span><span>Incident #{incident.id}</span></div>
            <h1>{incident.title}</h1>
            <div className="investigation-meta"><span>Subject: <strong>{incident.subjectName}</strong></span><StatusBadge status={incident.status} /><SeverityBadge severity={findings.severity} /></div>
          </div>
        </div>
        <div className="heading-actions"><button className="button button-secondary" onClick={() => setAuditOpen(true)}>Audit trail</button><button className="button button-reset" onClick={resetDemoState} disabled={resetRunning || analysisRunning}>{resetRunning && <LoaderCircle className="spin" size={15} />}{resetRunning ? "Resetting..." : "Reset Demo"}</button><div className="export-report-control"><select aria-label="Forensic report format" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as "markdown" | "json")} disabled={exportRunning}><option value="markdown">Markdown (.md)</option><option value="json">Raw JSON (.json)</option></select><button className="button button-primary" onClick={() => void exportForensicReport()} disabled={exportRunning}>{exportRunning ? "Preparing report..." : "Export Forensic Report"}</button></div><button className="button button-primary" onClick={runAnalysis} disabled={analysisRunning || resetRunning}>{analysisRunning && <LoaderCircle className="spin" size={16} />}{analysisRunning ? "Analyzing..." : "Run AI analysis"}</button></div>
      </div>
      {analysisError && <p className="analysis-error" role="alert">{analysisError}</p>}
      {exportError && <p className="analysis-error" role="alert">{exportError}</p>}
      {resetNotice && <p className="reset-notice" role="status">{resetNotice}</p>}

      <div className="investigation-summary panel">
        <div className="summary-score"><div className="score-gauge" style={{ "--score": `${findings.riskScore}%`, "--risk-hue": `${Math.round(185 * (1 - findings.riskScore / 100))}` } as React.CSSProperties}><span>{findings.riskScore}</span><small>RISK</small></div><div><span className="summary-label">RISK SCORE</span><strong className="summary-score-text">{findings.severity} risk detected</strong><small>Updated {analysisResult ? "just now" : "12 minutes ago"}</small></div></div>
        <div className="summary-separator" /><div className="summary-stat"><span className="summary-label">THREAT CLASSIFICATION</span><strong>{findings.threatClassification}</strong><small>Confidence {findings.confidence}%</small></div>
        <div className="summary-separator" /><div className="summary-stat"><span className="summary-label">BLAST RADIUS</span><strong className="blast-number">{findings.blastRadius} <small>assets</small></strong><small>Across connected systems</small></div>
        <div className="summary-separator" /><div className="summary-stat"><span className="summary-label">CREATED</span><strong>{relativeTime(incident.createdAt)}</strong><small>By detection engine</small></div>
      </div>

      <div className="investigation-layout">
        <div className="investigation-left">
          <section className="panel graph-panel">
            <div className="panel-heading graph-heading"><div><div className="section-title-row"><h2>Attack path</h2></div><p>Observed entity relationships and potential data exposure path</p></div><button className="button button-quiet" onClick={() => setAuditOpen(true)}>Evidence log</button></div>
            <div className="graph-filter-bar" role="group" aria-label="Filter attack graph nodes">
              <span>SHOW</span>
              <button type="button" className={`graph-filter-button ${!highRiskOnly ? "active" : ""}`} aria-pressed={!highRiskOnly} onClick={() => setHighRiskOnly(false)}>All Nodes</button>
              <button type="button" className={`graph-filter-button ${highRiskOnly ? "active" : ""}`} aria-pressed={highRiskOnly} onClick={() => setHighRiskOnly(true)}>High &amp; Critical Only</button>
            </div>
            <AttackGraph nodes={graph.nodes} edges={graph.edges} highRiskOnly={highRiskOnly} onNodeClick={handleGraphNodeClick} />
            <div className="graph-footnote"><span><i className="graph-foot-dot" /> Path confidence <strong>{findings.confidence}%</strong></span><span>{analysisResult ? "Generated just now" : "Seeded investigation path"}</span></div>
          </section>
          <section className="panel impact-panel"><div className="panel-heading"><div><div className="section-title-row"><h2>Impact summary</h2></div></div><span className={`impact-tag severity-${findings.severity.toLowerCase()}`}>{findings.severity.toUpperCase()} IMPACT</span></div><p>{findings.impactSummary} Activity spans <strong>{findings.blastRadius} connected assets</strong>.</p><div className="impact-tags"><span>Customer records</span><span>Source code</span><span>Restricted share</span></div></section>
        </div>

        <div className="investigation-right">
          <section className="panel findings-panel">
            <div className="panel-heading findings-heading"><div><div className="section-title-row"><h2>AI findings</h2></div><p>Nemotron-powered investigation insights</p></div></div>
            <div className="finding-classification"><span className="summary-label">CLASSIFICATION</span><div><strong>{findings.threatClassification}</strong><span className={`finding-severity severity-${findings.severity.toLowerCase()}`}>{findings.severity}</span></div></div>
            <div className="finding-blast"><div><span className="summary-label">ESTIMATED BLAST RADIUS</span><small>Potentially affected assets</small></div><strong>{findings.blastRadius}<span> assets</span></strong></div>
            <div className="finding-summary"><span className="summary-label">IMPACT SUMMARY</span><p>{findings.impactSummary}</p></div>
            <div className="recommendations"><span className="summary-label">RECOMMENDED ACTIONS</span>{findings.recommendations.map((recommendation, index) => {
              const isChecked = checked.includes(recommendation);
              return <button className={`recommendation ${isChecked ? "recommendation-done" : ""}`} key={recommendation} onClick={() => setChecked((current) => isChecked ? current.filter((value) => value !== recommendation) : [...current, recommendation])}><span className="recommendation-check">{isChecked ? <Check size={12} /> : index + 1}</span><span>{recommendation}</span><span className={`action-priority ${index === 0 ? "priority-immediate" : ""}`}>{index === 0 ? "Immediate" : "Recommended"}</span></button>;
            })}</div>
            <button className="text-action" onClick={runAnalysis}>{analysisRunning ? "Analysis in progress..." : "Refresh AI analysis"}</button>
          </section>

          <section className="panel notes-panel">
            <div className="panel-heading compact-heading"><div><div className="section-title-row"><h2>Investigation notes</h2><span className="count-pill">{notes.length}</span></div></div><button className="small-icon-button" aria-label="More note options">···</button></div>
            <div className="notes-list">{notes.map((note) => <article className="note-item" key={note.id}><span className={`avatar note-avatar ${note.initials === "AM" ? "avatar-blue" : "avatar-note"}`}>{note.initials}</span><div className="note-content"><div className="note-author"><strong>{note.author}</strong><time>{relativeTime(note.createdAt)}</time></div><p>{note.content}</p></div></article>)}</div>
            <form className="note-form" onSubmit={addNote}><span className="avatar avatar-blue note-avatar">AM</span><div className="note-input-wrap"><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Add an investigation note..." rows={2} /><div className="note-submit-row"><span>Visible to investigation team</span><button type="submit" className="button button-primary button-small" disabled={!noteText.trim()}>Add note</button></div></div></form>
          </section>

          <AuditFeedPanel activities={panelActivities} auditEntries={liveAuditEntries} incidentId={incident.id} />
        </div>
      </div>

      {auditOpen && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuditOpen(false); }}><aside className="audit-drawer" role="dialog" aria-modal="true" aria-labelledby="audit-title"><div className="drawer-header"><div><div className="drawer-kicker"><span className="status-dot" /> TAMPER-EVIDENT RECORD</div><h2 id="audit-title">Audit trail</h2><p>Cryptographically linked investigation events.</p></div><button className="icon-button" onClick={() => setAuditOpen(false)} aria-label="Close audit trail">×</button></div><div className="chain-status"><span><strong>Chain integrity verified</strong><small>All {auditLogs.length} entries are linked and unmodified</small></span></div><div className="audit-list">{auditLogs.map((log) => <article className="audit-entry" key={log.id}><div className="audit-entry-heading"><span className="audit-sequence">#{String(log.sequence).padStart(4, "0")}</span><span className="audit-time">{relativeTime(log.timestamp)}</span></div><h3>{log.action}</h3><span className="audit-actor">by <strong>{log.actor}</strong></span><div className="hash-row"><span>PREVIOUS HASH</span><code>{log.previousHash}</code></div><div className="hash-row"><span>CURRENT HASH</span><code>{log.currentHash}</code></div></article>)}</div><div className="drawer-footer"><span>SHA-256 · Append-only event chain</span><button onClick={() => setAuditOpen(false)}>Done</button></div></aside></div>}
      {selectedAsset && (
        <div className="drawer-backdrop asset-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAsset(null); }}>
          <aside className="asset-inspection-drawer" role="dialog" aria-modal="true" aria-labelledby="asset-drawer-title">
            <div className="drawer-header">
              <div>
                <div className="drawer-kicker"><span className="status-dot" /> ATTACK PATH ENTITY</div>
                <h2 id="asset-drawer-title">{selectedAsset.name}</h2>
                <p>{getAssetTypeLabel(selectedAsset.type)}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedAsset(null)} aria-label="Close asset details"><X size={18} /></button>
            </div>
            <div className="asset-drawer-content">
              <div className="asset-risk-summary">
                <div><span className="summary-label">RISK SCORE</span><strong className={`asset-drawer-risk risk-${selectedAssetSeverity.toLowerCase()}`}>{selectedAssetRiskScore}<small>/100</small></strong></div>
                <div><span className="summary-label">SEVERITY</span><SeverityBadge severity={selectedAssetSeverity} /></div>
              </div>
              <section className="asset-detail-section">
                <span className="summary-label">COMPROMISE DETAILS</span>
                <p>{selectedAsset.description || "No additional asset details are available."}</p>
                <span className={`asset-blast-status ${selectedAssetSeverity === "High" || selectedAssetSeverity === "Critical" ? "in-blast-radius" : ""}`}>
                  <i />{selectedAssetSeverity === "High" || selectedAssetSeverity === "Critical" ? "In potential blast radius" : "Monitored — no direct compromise detected"}
                </span>
              </section>
              <section className="asset-detail-section asset-scope-section">
                <span className="summary-label">DATA COMPROMISE SCOPE</span>
                <div className={`scope-status-tag ${selectedAssetScope === "Quarantined" ? "scope-quarantined" : `scope-${selectedAssetScope.toLowerCase().replaceAll(" ", "-")}`}`}>
                  {selectedAssetScope === "Quarantined" && <ShieldCheck size={15} />}
                  <span>{selectedAssetScope}</span>
                </div>
                <label className="scope-select-label" htmlFor="asset-scope">Update asset scope</label>
                <select id="asset-scope" className="scope-select" value={selectedAssetScope} onChange={(event) => void updateAssetScope(event.target.value as AssetScopeStatus)} disabled={assetActionPending}>
                  <option>Exfiltrated</option>
                  <option>Ransomware Encrypted</option>
                  <option>Targeted</option>
                  <option>Quarantined</option>
                </select>
              </section>
              <section className="asset-detail-section containment-section">
                <span className="summary-label">OUT-OF-BAND CONTAINMENT</span>
                <p>{getContainmentAction(selectedAsset.type)} action for this asset.</p>
                <pre className="mitigation-terminal"><code>{`containment.request --asset "${selectedAsset.name}" --action "${getContainmentActionType(selectedAsset.type)}" --mode record-only`}</code></pre>
                <small className="containment-disclaimer">Demo simulation only. No infrastructure command is executed.</small>
                <button className="containment-button" onClick={() => void executeContainment()} disabled={assetActionPending || selectedAssetScope === "Quarantined"}>
                  {assetActionPending ? <><LoaderCircle className="spin" size={15} /> Applying containment...</> : selectedAssetScope === "Quarantined" ? <><ShieldCheck size={16} /> Asset Quarantined</> : "Execute Out-of-Band Containment"}
                </button>
              </section>
              <section className="asset-detail-section">
                <span className="summary-label">RELATED RECOMMENDATIONS</span>
                {selectedAssetRecommendations.length ? (
                  <ul className="asset-recommendation-list">{selectedAssetRecommendations.map((recommendation) => <li key={recommendation}><Check size={13} />{recommendation}</li>)}</ul>
                ) : <p>No recommendations are currently associated with this asset.</p>}
              </section>
            </div>
            <div className="drawer-footer"><span>Asset details from the current investigation</span><button onClick={() => setSelectedAsset(null)}>Done</button></div>
          </aside>
        </div>
      )}
    </>
  );
}

function getAssetSeverity(riskLabel: string | undefined, fallback: FrontendIncident["severity"]): FrontendIncident["severity"] {
  const normalized = riskLabel?.toLowerCase();
  if (normalized === "critical" || normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized[0].toUpperCase() + normalized.slice(1) as FrontendIncident["severity"];
  }
  return fallback;
}

function getAssetRiskScore(severity: FrontendIncident["severity"]): number {
  switch (severity) {
    case "Critical": return 95;
    case "High": return 78;
    case "Medium": return 52;
    case "Low": return 24;
  }
}

function getAssetTypeLabel(type: string): string {
  switch (type.toLowerCase()) {
    case "identity": return "Host / Service Identity";
    case "role":
    case "iam":
    case "resource": return "IAM Role / Resource";
    case "share": return "S3 Bucket / Shared Resource";
    case "database": return "Database";
    default: return "Investigation Asset";
  }
}

function toAssetScopeStatus(status: string): AssetScopeStatus {
  switch (status.toLowerCase()) {
    case "data_exfiltrated":
    case "exfiltrated": return "Exfiltrated";
    case "ransomware_encrypted": return "Ransomware Encrypted";
    case "quarantined": return "Quarantined";
    case "targeted":
    case "compromised":
    case "clean":
    default: return "Targeted";
  }
}

function toReducerCompromiseStatus(status: AssetScopeStatus): string {
  switch (status) {
    case "Exfiltrated": return "data_exfiltrated";
    case "Ransomware Encrypted": return "ransomware_encrypted";
    case "Targeted": return "targeted";
    case "Quarantined": return "quarantined";
  }
}

function getContainmentAction(type: FrontendAsset["type"]): string {
  switch (type) {
    case "identity": return "Credential revocation";
    case "share": return "Shared resource lock";
    case "database": return "Database access isolation";
    case "resource": return "Host or resource isolation";
  }
}

function getContainmentActionType(type: FrontendAsset["type"]): string {
  switch (type) {
    case "identity": return "revoke_iam";
    case "share": return "lock_s3_bucket";
    case "database": return "block_network";
    case "resource": return "isolate_host";
  }
}

function getAssetRecommendations(asset: FrontendAsset, recommendations: string[]): string[] {
  const terms = `${asset.name} ${asset.type} ${asset.description}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3);
  const relevant = recommendations.filter((recommendation) => {
    const normalized = recommendation.toLowerCase();
    return terms.some((term) => normalized.includes(term));
  });
  return relevant.length > 0 ? relevant : recommendations.slice(0, 3);
}
