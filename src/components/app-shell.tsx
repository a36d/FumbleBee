"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { Bell, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthModal } from "@/components/auth-modal";
import { ProfileDialog } from "@/components/profile-dialog";
import { CompanySwitcher } from "@/components/company-switcher";
import { SpacetimeConnectionProvider } from "@/components/spacetime-connection-provider";
import { useSpacetimeConnection } from "@/components/spacetime-connection-provider";
import { tables } from "@/generated/spacetimedb";
import type { AuditLog as LiveAuditLog, Incident as LiveIncident } from "@/generated/spacetimedb/types";
import { incidents as demoIncidents } from "@/lib/mock-data";
import { normalizeRole } from "@/lib/roles";

interface InvestigationTab {
  id: string;
  title: string;
}

const maxInvestigationTabs = 5;

function WorkspaceNavigation({ isInvestigation, isIncidents, isPersonalIncidents, incidentId }: {
  isInvestigation: boolean;
  isIncidents: boolean;
  isPersonalIncidents: boolean;
  incidentId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { connection, responderSession, sessionLoaded } = useSpacetimeConnection();
  const isAdmin = sessionLoaded && normalizeRole(responderSession?.role) === "Admin";
  const [tabs, setTabs] = useState<InvestigationTab[]>([]);
  const [incidentTitles, setIncidentTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!connection) {
      setIncidentTitles({});
      return;
    }

    let active = true;
    const refreshIncidents = () => {
      if (!active) return;
      const liveTitles = Object.fromEntries(
        (Array.from(connection.db.incident.iter()) as LiveIncident[])
          .map((incident) => [incident.id.toString(), incident.title]),
      );
      setIncidentTitles(liveTitles);
    };

    connection.db.incident.onInsert(refreshIncidents);
    connection.db.incident.onUpdate(refreshIncidents);
    connection.db.incident.onDelete(refreshIncidents);
    const subscription = connection.subscriptionBuilder()
      .onApplied(refreshIncidents)
      .subscribe([tables.incident]);

    return () => {
      active = false;
      connection.db.incident.removeOnInsert(refreshIncidents);
      connection.db.incident.removeOnUpdate(refreshIncidents);
      connection.db.incident.removeOnDelete(refreshIncidents);
      subscription.unsubscribe();
    };
  }, [connection]);

  useEffect(() => {
    if (!incidentId) return;
    const fallbackTitle = demoIncidents.find((incident) => incident.id === incidentId)?.title;
    setTabs((current) => {
      if (current.some((tab) => tab.id === incidentId)) return current;
      const title = incidentTitles[incidentId] ?? fallbackTitle ?? `Incident #${incidentId}`;
      const next = [...current, { id: incidentId, title }];
      return next.slice(-maxInvestigationTabs);
    });
  }, [incidentId, incidentTitles]);

  function closeTab(event: React.MouseEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    event.stopPropagation();
    const index = tabs.findIndex((tab) => tab.id === id);
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (pathname === `/investigations/${id}`) {
      const nextTab = next[Math.min(index, next.length - 1)];
      router.push(nextTab ? `/investigations/${nextTab.id}` : isAdmin ? "/incidents" : "/personal-incidents");
    }
  }

  return (
    <nav className="main-nav">
      {isAdmin && <Link className={`nav-item ${!isInvestigation && !isIncidents && !isPersonalIncidents ? "active" : ""}`} href="/">Overview</Link>}
      <Link className={`nav-item ${isPersonalIncidents || (isInvestigation && !isAdmin) ? "active" : ""}`} href="/personal-incidents">Personal Incidents</Link>
      {isAdmin && <Link className={`nav-item ${isInvestigation || isIncidents ? "active" : ""}`} href="/incidents">Security Incidents</Link>}
      {tabs.length > 0 && (
        <div className="investigation-tabs" aria-label="Open investigations">
          {tabs.map((tab) => (
            <div className={`investigation-tab ${incidentId === tab.id ? "active" : ""}`} key={tab.id}>
              <Link href={`/investigations/${tab.id}`} title={tab.title}>
                <span className="investigation-tab-id">#{tab.id}</span>
                <span className="investigation-tab-title">{tab.title}</span>
              </Link>
              <button type="button" onClick={(event) => closeTab(event, tab.id)} aria-label={`Close investigation ${tab.id}`} title={`Close investigation ${tab.id}`}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}

function NotificationBell() {
  const { connection } = useSpacetimeConnection();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [auditEntries, setAuditEntries] = useState<LiveAuditLog[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!connection) {
      setAuditEntries([]);
      return;
    }

    let active = true;
    let initialized = false;
    const refreshAuditLogs = () => {
      if (!active) return;
      const entries = (Array.from(connection.db.auditLog.iter()) as LiveAuditLog[])
        .sort((left, right) => {
          if (left.sequenceId !== right.sequenceId) return right.sequenceId > left.sequenceId ? 1 : -1;
          if (right.timestamp.microsSinceUnixEpoch !== left.timestamp.microsSinceUnixEpoch) {
            return right.timestamp.microsSinceUnixEpoch > left.timestamp.microsSinceUnixEpoch ? 1 : -1;
          }
          return 0;
        })
        .slice(0, 5);
      setAuditEntries(entries);
      if (!initialized && entries.length > 0) {
        initialized = true;
        setUnreadCount(Math.min(entries.length, 5));
      }
    };

    refreshAuditLogs();
    connection.db.auditLog.onInsert(refreshAuditLogs);
    connection.db.auditLog.onUpdate(refreshAuditLogs);
    connection.db.auditLog.onDelete(refreshAuditLogs);
    const subscription = connection.subscriptionBuilder()
      .onApplied(refreshAuditLogs)
      .subscribe([tables.auditLog]);

    return () => {
      active = false;
      connection.db.auditLog.removeOnInsert(refreshAuditLogs);
      connection.db.auditLog.removeOnUpdate(refreshAuditLogs);
      connection.db.auditLog.removeOnDelete(refreshAuditLogs);
      subscription.unsubscribe();
    };
  }, [connection]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeNotifications = (event: MouseEvent) => {
      if (!notificationRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", closeNotifications);
    return () => document.removeEventListener("mousedown", closeNotifications);
  }, [notificationsOpen]);

  function classifyAction(action: string): { label: string; className: string } {
    if (/incident_created/i.test(action)) return { label: "ALERT", className: "critical" };
    if (/AI analysis|AiAnalysis|Nemotron/i.test(action)) return { label: "AI TRIAGE", className: "verified" };
    if (/asset contained|contained/i.test(action)) return { label: "CONTAINMENT", className: "" };
    return { label: "AUDIT", className: "" };
  }

  return (
    <div className="notification-popover-anchor" ref={notificationRef}>
      <button
        type="button"
        className="icon-button notification-button"
        aria-label="Notifications"
        aria-expanded={notificationsOpen}
        onClick={() => {
          setNotificationsOpen((current) => !current);
          setUnreadCount(0);
        }}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="notification-unread-badge" aria-label={`${unreadCount} unread notifications`}>
            {unreadCount}
          </span>
        )}
      </button>
      {notificationsOpen && (
        <div className="notification-popover" role="dialog" aria-label="Recent notifications">
          <div className="notification-popover-heading">
            <strong>System notifications</strong>
            <span>{auditEntries.length > 0 ? `${auditEntries.length} recent` : "0 recent"}</span>
          </div>
          {auditEntries.length === 0 ? (
            <p className="notification-empty">No recent system notifications</p>
          ) : (
            <ul>
              {auditEntries.map((entry) => {
                const notification = classifyAction(entry.action);
                return (
                  <li key={entry.sequenceId.toString()}>
                    <span className={`notification-severity ${notification.className}`}>{notification.label}</span>
                    <p>{entry.action}</p>
                    <small>Sequence #{entry.sequenceId.toString()}</small>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SpacetimeConnectionProvider>
      <AppShellContent>{children}</AppShellContent>
    </SpacetimeConnectionProvider>
  );
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { responderSession, sessionLoaded } = useSpacetimeConnection();
  const isInvestigation = pathname.startsWith("/investigations/");
  const isIncidents = pathname === "/incidents";
  const isPersonalIncidents = pathname === "/personal-incidents";
  const investigationMatch = pathname.match(/^\/investigations\/([^/?#]+)/);
  const incidentId = investigationMatch?.[1] ?? null;
  const isEmployee = sessionLoaded && normalizeRole(responderSession?.role) === "Employee";

  useEffect(() => {
    if (isEmployee && (pathname === "/" || pathname === "/incidents")) {
      router.replace("/personal-incidents");
    }
  }, [isEmployee, pathname, router]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Image className="brand-logo" src="/fumblebee-bee.png" alt="" width={42} height={42} priority />
          <span className="brand-name">FumbleBee</span>
        </Link>
        <CompanySwitcher />
        <div className="nav-label">WORKSPACE</div>
        <WorkspaceNavigation isInvestigation={isInvestigation} isIncidents={isIncidents} isPersonalIncidents={isPersonalIncidents} incidentId={incidentId} />
        <div className="sidebar-bottom">
          <div className="system-status"><span className="status-dot" /><span><strong>All systems operational</strong><small>Last synced just now</small></span></div>
          <ProfileDialog />
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{isInvestigation ? "Investigation" : isPersonalIncidents ? "Personal Incidents" : isIncidents ? "Security Incidents" : "Overview"}</strong></div>
          <div className="topbar-actions">
            <NotificationBell />
            <div className="topbar-divider" />
            <AuthModal />
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
