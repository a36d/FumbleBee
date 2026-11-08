"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { Bell, ChevronDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthModal } from "@/components/auth-modal";
import { SpacetimeConnectionProvider } from "@/components/spacetime-connection-provider";
import { useSpacetimeConnection } from "@/components/spacetime-connection-provider";
import { tables } from "@/generated/spacetimedb";
import type { Incident as LiveIncident } from "@/generated/spacetimedb/types";
import { incidents as demoIncidents } from "@/lib/mock-data";

interface InvestigationTab {
  id: string;
  title: string;
}

const maxInvestigationTabs = 5;

function WorkspaceNavigation({ isInvestigation, isIncidents, incidentId }: {
  isInvestigation: boolean;
  isIncidents: boolean;
  incidentId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { connection } = useSpacetimeConnection();
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
      router.push(nextTab ? `/investigations/${nextTab.id}` : "/incidents");
    }
  }

  return (
    <nav className="main-nav">
      <Link className={`nav-item ${!isInvestigation && !isIncidents ? "active" : ""}`} href="/">Overview</Link>
      <Link className={`nav-item ${isInvestigation || isIncidents ? "active" : ""}`} href="/incidents">Security Incidents</Link>
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInvestigation = pathname.startsWith("/investigations/");
  const isIncidents = pathname === "/incidents";
  const investigationMatch = pathname.match(/^\/investigations\/([^/?#]+)/);
  const incidentId = investigationMatch?.[1] ?? null;

  return (
    <SpacetimeConnectionProvider>
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Image className="brand-logo" src="/fumblebee-bee.png" alt="" width={42} height={42} priority />
          <span className="brand-name">FumbleBee</span>
        </Link>
        <div className="workspace-switch"><span className="workspace-icon">A</span><span className="workspace-copy"><strong>Acme Corporation</strong><small>Enterprise workspace</small></span><ChevronDown size={14} /></div>
        <div className="nav-label">WORKSPACE</div>
        <WorkspaceNavigation isInvestigation={isInvestigation} isIncidents={isIncidents} incidentId={incidentId} />
        <div className="sidebar-bottom">
          <div className="system-status"><span className="status-dot" /><span><strong>All systems operational</strong><small>Last synced just now</small></span></div>
          <button className="profile-button"><span className="avatar avatar-green">AM</span><span className="profile-copy"><strong>Alex Morgan</strong><small>Security analyst</small></span><ChevronDown size={14} /></button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{isInvestigation ? "Investigation" : isIncidents ? "Security Incidents" : "Overview"}</strong></div>
          <div className="topbar-actions"><button className="icon-button notification-button" aria-label="Notifications"><Bell size={17} /><i /></button><div className="topbar-divider" /><AuthModal /></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
    </SpacetimeConnectionProvider>
  );
}
