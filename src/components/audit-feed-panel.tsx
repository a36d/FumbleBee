"use client";

import { useMemo, useState } from "react";
import { Activity, Check, CheckCircle2, Clipboard, Clock3, Fingerprint, ShieldCheck } from "lucide-react";

export interface AuditFeedActivity {
  id: string | bigint;
  actorName: string;
  action: string;
  createdAt: string | Date;
}

export interface AuditFeedEntry {
  sequenceId: string | bigint;
  action: string;
  timestamp: string | Date;
  currentHash: string;
  previousHash: string;
}

interface AuditFeedPanelProps {
  activities: AuditFeedActivity[];
  auditEntries: AuditFeedEntry[];
}

type PanelTab = "activity" | "audit";

function sequenceNumber(sequenceId: string | bigint): number {
  const parsed = Number(sequenceId);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid timestamp";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function isoTimestamp(value: string | Date): string | undefined {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function truncateHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 4)}...${hash.slice(-4)}` : hash;
}

export function AuditFeedPanel({ activities, auditEntries }: AuditFeedPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("activity");
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");

  const chronologicalActivities = useMemo(
    () => [...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activities],
  );
  const orderedAuditEntries = useMemo(
    () => [...auditEntries].sort((a, b) => sequenceNumber(b.sequenceId) - sequenceNumber(a.sequenceId)),
    [auditEntries],
  );
  const integrityVerified = useMemo(() => {
    const ascending = [...auditEntries].sort((a, b) => sequenceNumber(a.sequenceId) - sequenceNumber(b.sequenceId));
    return ascending.every((entry, index) => index === 0 || entry.previousHash === ascending[index - 1].currentHash);
  }, [auditEntries]);

  async function copyHash(hash: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      window.setTimeout(() => setCopiedHash((current) => current === hash ? null : current), 1800);
    } catch (error) {
      setCopyError(error instanceof Error ? `Could not copy hash: ${error.message}` : "Could not copy hash to the clipboard.");
    }
  }

  return (
    <section className="audit-feed-panel" aria-label="Activity and audit log">
      <header className="audit-feed-header">
        <div className="audit-feed-heading">
          <span className="audit-feed-icon"><Fingerprint size={17} /></span>
          <div>
            <h2>Activity &amp; audit</h2>
            <p>Investigation events and immutable records</p>
          </div>
        </div>
        {activeTab === "audit" && auditEntries.length > 0 && (
          <span className={`audit-integrity-badge ${integrityVerified ? "" : "audit-integrity-warning"}`}>
            {integrityVerified ? <ShieldCheck size={13} /> : <Clock3 size={13} />}
            {integrityVerified ? "Integrity Verified" : "Chain Mismatch"}
          </span>
        )}
      </header>

      <div className="audit-feed-tabs" role="tablist" aria-label="Activity and audit views">
        <button
          id="activity-tab"
          className={`audit-feed-tab ${activeTab === "activity" ? "active" : ""}`}
          role="tab"
          aria-selected={activeTab === "activity"}
          aria-controls="activity-panel"
          onClick={() => setActiveTab("activity")}
        >
          <Activity size={14} /> Live Activity Feed
          <span>{activities.length}</span>
        </button>
        <button
          id="audit-tab"
          className={`audit-feed-tab ${activeTab === "audit" ? "active" : ""}`}
          role="tab"
          aria-selected={activeTab === "audit"}
          aria-controls="audit-panel"
          onClick={() => setActiveTab("audit")}
        >
          <Fingerprint size={14} /> Immutable Audit Log
          <span>SHA-256</span>
        </button>
      </div>

      {activeTab === "activity" ? (
        <div className="audit-feed-content" id="activity-panel" role="tabpanel" aria-labelledby="activity-tab">
          {chronologicalActivities.length ? chronologicalActivities.map((activity) => (
            <article className="audit-activity-item" key={String(activity.id)}>
              <span className="audit-activity-marker"><Activity size={12} /></span>
              <div className="audit-activity-copy">
                <strong>{activity.action}</strong>
                <span>by {activity.actorName}</span>
              </div>
              <time dateTime={isoTimestamp(activity.createdAt)}>{formatTimestamp(activity.createdAt)}</time>
            </article>
          )) : <p className="audit-feed-empty">No activity has been recorded yet.</p>}
        </div>
      ) : (
        <div className="audit-feed-content" id="audit-panel" role="tabpanel" aria-labelledby="audit-tab">
          {copyError && <p className="audit-copy-error" role="alert">{copyError}</p>}
          {orderedAuditEntries.length ? orderedAuditEntries.map((entry) => (
            <article className="audit-log-item" key={String(entry.sequenceId)}>
              <div className="audit-log-topline">
                <span className="audit-log-sequence">#{String(entry.sequenceId)}</span>
                <time dateTime={isoTimestamp(entry.timestamp)}><Clock3 size={12} />{formatTimestamp(entry.timestamp)}</time>
              </div>
              <h3>{entry.action}</h3>
              <div className="audit-hash-row">
                <span>PREVIOUS HASH</span>
                <code title={entry.previousHash}>{truncateHash(entry.previousHash)}</code>
                <button type="button" onClick={() => void copyHash(entry.previousHash)} aria-label={`Copy previous hash for sequence ${entry.sequenceId}`}>
                  {copiedHash === entry.previousHash ? <Check size={13} /> : <Clipboard size={13} />}
                </button>
              </div>
              <div className="audit-hash-row">
                <span>CURRENT HASH</span>
                <code title={entry.currentHash}>{truncateHash(entry.currentHash)}</code>
                <button type="button" onClick={() => void copyHash(entry.currentHash)} aria-label={`Copy current hash for sequence ${entry.sequenceId}`}>
                  {copiedHash === entry.currentHash ? <Check size={13} /> : <Clipboard size={13} />}
                </button>
              </div>
            </article>
          )) : <p className="audit-feed-empty">No immutable audit entries are available.</p>}
          {integrityVerified && auditEntries.length > 0 && (
            <div className="audit-chain-note"><CheckCircle2 size={13} /> Each entry links to the previous record in the chain.</div>
          )}
        </div>
      )}
    </section>
  );
}
