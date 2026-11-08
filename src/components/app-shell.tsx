"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, ChevronDown, Command, FileClock, LayoutDashboard, Network, Search, ShieldCheck } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInvestigation = pathname.startsWith("/investigations/");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark"><Network size={20} strokeWidth={2.2} /></span>
          <span><strong>sentinel<span>graph</span></strong><small>THREAT INTELLIGENCE</small></span>
        </Link>
        <div className="workspace-switch"><span className="workspace-icon">A</span><span className="workspace-copy"><strong>Acme Corporation</strong><small>Enterprise workspace</small></span><ChevronDown size={14} /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav">
          <Link className={`nav-item ${!isInvestigation ? "active" : ""}`} href="/"><LayoutDashboard size={17} /> Overview</Link>
          <Link className={`nav-item ${isInvestigation ? "active" : ""}`} href="/investigations/1"><Activity size={17} /> Investigations <span className="nav-count">12</span></Link>
          <a className="nav-item" href="#activity"><Network size={17} /> Attack graph</a>
          <a className="nav-item" href="#audit"><FileClock size={17} /> Audit trail</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="system-status"><span className="status-dot" /><span><strong>All systems operational</strong><small>Last synced just now</small></span></div>
          <button className="profile-button"><span className="avatar avatar-green">AM</span><span className="profile-copy"><strong>Alex Morgan</strong><small>Security analyst</small></span><ChevronDown size={14} /></button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{isInvestigation ? "Investigation" : "Overview"}</strong></div>
          <div className="topbar-actions"><button className="search-trigger"><Search size={15} /><span>Search anything...</span><kbd><Command size={11} /> K</kbd></button><button className="icon-button notification-button" aria-label="Notifications"><Bell size={17} /><i /></button><div className="topbar-divider" /><span className="avatar avatar-blue">AM</span></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
