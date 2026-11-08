"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const responderRoles = [
  "SOC Investigator",
  "Incident Commander",
  "Forensics Lead",
  "Legal Counsel",
] as const;

type ResponderRole = (typeof responderRoles)[number];
type AuthMode = "signin" | "register" | "roles";

interface ResponderSession {
  username: string;
  role: ResponderRole;
}

const roleDescriptions: Record<ResponderRole, string> = {
  "SOC Investigator": "Investigate alerts and document incident evidence.",
  "Incident Commander": "Coordinate response decisions and containment.",
  "Forensics Lead": "Preserve evidence and coordinate forensic review.",
  "Legal Counsel": "Review incident scope and support legal response.",
};

function isResponderRole(value: unknown): value is ResponderRole {
  return typeof value === "string" && responderRoles.includes(value as ResponderRole);
}

export function AuthModal() {
  const [session, setSession] = useState<ResponderSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [role, setRole] = useState<ResponderRole>("SOC Investigator");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fumblebee_session");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (
          parsed &&
          typeof parsed === "object" &&
          "username" in parsed &&
          typeof parsed.username === "string" &&
          "role" in parsed &&
          isResponderRole(parsed.role)
        ) {
          setSession({ username: parsed.username, role: parsed.role });
        }
      }
    } catch {
      setError("Saved responder session could not be read.");
    } finally {
      setHydrated(true);
    }
  }, []);

  function openModal(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setOpen(true);
  }

  function submitSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || !passphrase) {
      setError("Enter a username and passphrase to continue.");
      return;
    }

    const nextSession = { username: cleanUsername, role };
    try {
      localStorage.setItem("fumblebee_session", JSON.stringify(nextSession));
      setSession(nextSession);
      setOpen(false);
      setPassphrase("");
      setError("");
    } catch {
      setError("Responder session could not be saved in this browser.");
    }
  }

  function signOut() {
    try {
      localStorage.removeItem("fumblebee_session");
      setSession(null);
      setUsername("");
      setPassphrase("");
      setError("");
    } catch {
      setError("Responder session could not be cleared.");
    }
  }

  return (
    <>
      <div className="responder-controls">
        <button className="responder-session-badge" onClick={() => openModal("signin")} aria-label="Manage responder session">
          <span className="responder-avatar">{session?.username.slice(0, 2).toUpperCase() || "—"}</span>
          <span className="responder-session-copy">
            <strong>{hydrated ? session?.username ?? "Responder not signed in" : "Loading responder..."}</strong>
            <small>{session?.role ?? "Local demo session"}</small>
          </span>
          {session && <span className="responder-role-chip">{session.role}</span>}
        </button>
        <button className="responder-admin-trigger" onClick={() => openModal("roles")}>
          Admin: Manage Roles / Add User
        </button>
      </div>

      {open && (
        <div className="modal-backdrop auth-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="modal-card auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
            <div className="modal-heading">
              <div>
                <span className="auth-kicker">OUT-OF-BAND RESPONSE ACCESS</span>
                <h2 id="auth-modal-title">
                  {mode === "roles" ? "Responder roles" : mode === "register" ? "Register incident responder" : "Sign in"}
                </h2>
                <p>Manage the local responder identity for this demo workspace.</p>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close responder access dialog"><X size={17} /></button>
            </div>

            <div className="auth-mode-tabs" role="tablist" aria-label="Responder access mode">
              <button className={mode === "signin" ? "active" : ""} role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setError(""); }}>Sign In</button>
              <button className={mode === "register" ? "active" : ""} role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>Register Incident Responder</button>
            </div>

            {mode === "roles" ? (
              <div className="auth-role-management">
                <div className="auth-role-list">
                  {responderRoles.map((responderRole) => (
                    <article key={responderRole}>
                      <strong>{responderRole}</strong>
                      <p>{roleDescriptions[responderRole]}</p>
                    </article>
                  ))}
                </div>
                <button className="button button-primary" onClick={() => { setMode("register"); setError(""); }}>Add User / Register Responder</button>
              </div>
            ) : (
              <form className="modal-form auth-form" onSubmit={submitSession}>
                <label>
                  Username
                  <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
                </label>
                <label>
                  Passphrase
                  <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required />
                </label>
                <label>
                  Responder role
                  <select value={role} onChange={(event) => setRole(event.target.value as ResponderRole)}>
                    {responderRoles.map((responderRole) => <option key={responderRole}>{responderRole}</option>)}
                  </select>
                </label>
                <p className="auth-demo-notice">Demo only: the passphrase is not stored or sent to an authentication service. Only responder name and role are saved in this browser.</p>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <div className="modal-actions">
                  {session && <button className="button button-secondary" type="button" onClick={signOut}>Sign out</button>}
                  <button className="button button-primary" type="submit">{mode === "register" ? "Register Responder" : "Sign In"}</button>
                </div>
              </form>
            )}
            {mode === "roles" && error && <p className="auth-error" role="alert">{error}</p>}
          </section>
        </div>
      )}
    </>
  );
}
