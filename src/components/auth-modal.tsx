"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { tables } from "@/generated/spacetimedb";
import type { User } from "@/generated/spacetimedb/types";
import { useSpacetimeConnection } from "@/components/spacetime-connection-provider";
import { hashPassword } from "@/lib/auth";

const responderRoles = ["Employee", "Admin"] as const;
type ResponderRole = (typeof responderRoles)[number];
type AssignableRole = ResponderRole;
type AuthMode = "signin" | "register" | "roles";

interface ResponderSession {
  username: string;
  role: ResponderRole;
}

interface SavedResponderSession extends ResponderSession {
  token: string;
}

type ResponderAccount = Pick<User, "identity" | "username" | "role">;

function withTimeout<T>(operation: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error("The SpacetimeDB responder did not respond within 5 seconds. Please try again.")),
      timeoutMs,
    );
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

const roleDescriptions: Record<ResponderRole, string> = {
  Employee: "Investigate incidents and contribute incident evidence.",
  Admin: "Manage company members, roles, and incident response.",
};

function isResponderRole(value: unknown): value is ResponderRole {
  return value === "Admin" || value === "Employee";
}

function reducerRole(role: AssignableRole): string {
  switch (role) {
    case "Admin": return "Admin";
    case "Employee": return "Employee";
  }
}

function displayRole(role: string): string {
  switch (role) {
    case "Admin":
    case "admin": return "Admin";
    case "Employee":
    case "employee":
    case "investigator":
    case "commander":
    case "legal":
    case "viewer": return "Employee";
    default: return "Employee";
  }
}

function responderRoleFromDatabase(role: string): ResponderRole {
  switch (role) {
    case "Admin":
    case "admin": return "Admin";
    default: return "Employee";
  }
}

function compactRole(role: string): string {
  switch (role) {
    case "Admin":
    case "admin": return "Admin";
    default: return "Employee";
  }
}

function isSavedResponderSession(value: unknown): value is SavedResponderSession {
  return Boolean(
    value &&
    typeof value === "object" &&
    "username" in value &&
    typeof value.username === "string" &&
    "role" in value &&
    isResponderRole(value.role) &&
    "token" in value &&
    typeof value.token === "string",
  );
}

export function AuthModal({ externalOpenToken = 0 }: { externalOpenToken?: number }) {
  const { connection, connectionError, saveSession, switchSession } = useSpacetimeConnection();
  const [session, setSession] = useState<ResponderSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ResponderRole>("Employee");
  const [users, setUsers] = useState<ResponderAccount[]>([]);
  const [savedSessions, setSavedSessions] = useState<SavedResponderSession[]>([]);
  const [sessionToSwitch, setSessionToSwitch] = useState("");
  const [targetIdentity, setTargetIdentity] = useState("");
  const [newRole, setNewRole] = useState<AssignableRole>("Employee");
  const [inviteUsername, setInviteUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (externalOpenToken > 0) {
      setMode("roles");
      setError("");
      setOpen(true);
    }
  }, [externalOpenToken]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

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
      const savedSessionsValue: unknown = JSON.parse(localStorage.getItem("fumblebee_responder_sessions") ?? "[]");
      if (Array.isArray(savedSessionsValue)) {
        setSavedSessions(savedSessionsValue.filter(isSavedResponderSession));
      }
    } catch {
      setError("Saved responder session could not be read.");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!connection) {
      setUsers([]);
      return;
    }

    let active = true;
    const refreshUsers = () => {
      if (active) {
        setUsers(Array.from(connection.db.user.iter(), ({ identity, username, role }) => ({
          identity,
          username,
          role,
        })));
      }
    };
    connection.db.user.onInsert(refreshUsers);
    connection.db.user.onUpdate(refreshUsers);
    connection.db.user.onDelete(refreshUsers);
    const subscription = connection.subscriptionBuilder()
      .onApplied(refreshUsers)
      .onError((context) => {
        if (active) setError(`Could not load responder accounts: ${context.event?.message ?? "unknown subscription error"}`);
      })
      .subscribe([tables.user]);

    return () => {
      active = false;
      connection.db.user.removeOnInsert(refreshUsers);
      connection.db.user.removeOnUpdate(refreshUsers);
      connection.db.user.removeOnDelete(refreshUsers);
      subscription.unsubscribe();
    };
  }, [connection]);

  function openModal(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setOpen(true);
  }

  async function submitSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError("Enter a username and password to continue.");
      return;
    }
    if (!connection) {
      setError(connectionError || "SpacetimeDB is not connected. Try again when the connection is restored.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const passwordHash = await hashPassword(password);
      let nextRole: ResponderRole;
      if (mode === "signin") {
        const existingUser = Array.from(connection.db.user.iter())
          .find((user) => user.username === cleanUsername);
        await withTimeout(connection.reducers.signIn({
          username: cleanUsername,
          passwordHash,
        }));
        const authenticatedUser = Array.from(connection.db.user.iter())
          .find((user) => user.username === cleanUsername);
        nextRole = responderRoleFromDatabase(authenticatedUser?.role ?? existingUser?.role ?? "");
      } else {
        const registrationDispatch = connection.reducers.signUp({
          username: cleanUsername,
          passwordHash,
          role: reducerRole(role),
        });
        void Promise.resolve(registrationDispatch).catch((registrationError) => {
          setError(registrationError instanceof Error ? registrationError.message : "Responder registration failed.");
        });
        nextRole = role;
      }

      const nextSession = { username: cleanUsername, role: nextRole };
      try {
        saveSession(nextSession);
      } catch {
        localStorage.setItem("fumblebee_session", JSON.stringify(nextSession));
      }
      localStorage.setItem("fumblebee_active_responder", JSON.stringify(nextSession));
      setSession(nextSession);
      const savedSessionsValue: unknown = JSON.parse(localStorage.getItem("fumblebee_responder_sessions") ?? "[]");
      setSavedSessions(Array.isArray(savedSessionsValue) ? savedSessionsValue.filter(isSavedResponderSession) : []);
      setOpen(false);
      setUsername("");
      setPassword("");
      setError("");
      if (mode === "register") setNotice(`Responder ${cleanUsername} registered successfully.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : mode === "signin" ? "Sign in failed." : "Responder registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function changeResponderSession() {
    const nextSession = savedSessions.find((saved) => saved.username === sessionToSwitch);
    if (!nextSession) {
      setError("Choose a responder session saved on this device.");
      return;
    }
    try {
      switchSession(nextSession);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Could not switch responder session.");
    }
  }

  function signOut() {
    try {
      localStorage.removeItem("fumblebee_session");
      setSession(null);
      setUsername("");
      setPassword("");
      setError("");
      window.location.reload();
    } catch {
      setError("Responder session could not be cleared.");
    }
  }

  async function assignRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connection) {
      setError(connectionError || "SpacetimeDB is not connected. Try again when the connection is restored.");
      return;
    }
    const target = users.find((user) => user.identity.toHexString() === targetIdentity);
    if (!target) {
      setError("Select an existing responder account.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await withTimeout(connection.reducers.assignUserRole({
        targetIdentity: target.identity,
        newRole: reducerRole(newRole),
      }));
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Responder role update failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connection) {
      setError(connectionError || "SpacetimeDB is not connected.");
      return;
    }
    if (session?.role !== "Admin") {
      setError("Only authenticated Admin users can invite company members.");
      return;
    }
    const username = inviteUsername.trim();
    if (!username) {
      setError("Enter the username of an existing account.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await withTimeout(connection.reducers.inviteMember({ username }));
      setInviteUsername("");
      setNotice(`${username} was added to the company workspace as Employee.`);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Company invite failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="responder-controls">
        <button className="responder-session-badge" onClick={() => openModal("roles")} aria-label="Switch responder or manage responder roles">
          <span className="responder-avatar">{session?.username.slice(0, 2).toUpperCase() || "—"}</span>
          <span className="responder-session-copy">
            <strong>{hydrated ? session?.username ?? "Responder not signed in" : "Loading responder..."}</strong>
            <small>{session ? "Active responder" : "No active responder"}</small>
          </span>
          {session && <span className="responder-role-chip">{compactRole(session.role)}</span>}
        </button>
        <button className="responder-admin-trigger" onClick={() => openModal("roles")}>
          Admin: Manage Roles / Add User
        </button>
      </div>
      {notice && <p className="auth-success-notice" role="status">{notice}</p>}

      {open && createPortal(
        <div className="modal-backdrop auth-modal-backdrop" onClick={() => setOpen(false)}>
          <section className="modal-card auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="auth-kicker">OUT-OF-BAND RESPONSE ACCESS</span>
                <h2 id="auth-modal-title">
                  {mode === "roles" ? "Responder roles" : mode === "register" ? "Register incident responder" : "Sign in"}
                </h2>
                <p>Manage the responder identity for this workspace.</p>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close responder access dialog"><X size={17} /></button>
            </div>

            <div className="auth-mode-tabs" role="tablist" aria-label="Responder access mode">
              <button className={mode === "signin" ? "active" : ""} role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setError(""); }}>Sign In</button>
              <button className={mode === "register" ? "active" : ""} role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>Register Incident Responder</button>
            </div>

            {mode === "roles" ? (
              <div className="auth-role-management">
                <div className="auth-session-switcher">
                  <label htmlFor="saved-responder-session">Switch active responder</label>
                  <div>
                    <select
                      id="saved-responder-session"
                      className="bg-zinc-900 text-zinc-100 border border-zinc-700"
                      value={sessionToSwitch}
                      onChange={(event) => setSessionToSwitch(event.target.value)}
                      style={{ backgroundColor: "#18181b", color: "#f4f4f5", borderColor: "#3f3f46" }}
                    >
                      <option className="bg-zinc-900 text-zinc-100" value="">Select a saved responder</option>
                      {savedSessions.map((saved) => (
                        <option className="bg-zinc-900 text-zinc-100" key={saved.username} value={saved.username}>
                          {saved.username} · {compactRole(saved.role)}{saved.username === session?.username ? " (active)" : ""}
                        </option>
                      ))}
                    </select>
                    <button className="button button-secondary" type="button" onClick={changeResponderSession} disabled={!sessionToSwitch}>
                      Switch
                    </button>
                  </div>
                  <small>Only sessions previously registered on this device can be switched to.</small>
                </div>
                {session?.role === "Admin" ? (
                  <>
                <form className="auth-role-form auth-invite-form" onSubmit={inviteMember}>
                  <label>
                    Invite existing account
                    <input
                      value={inviteUsername}
                      onChange={(event) => setInviteUsername(event.target.value)}
                      placeholder="Username"
                      autoComplete="off"
                    />
                  </label>
                  <button className="button button-primary" type="submit" disabled={submitting || !connection}>
                    {submitting ? "Inviting..." : "Invite to Acme Corporation"}
                  </button>
                </form>
                <form className="auth-role-form" onSubmit={assignRole}>
                  <label>
                    Responder account
                    <select value={targetIdentity} onChange={(event) => setTargetIdentity(event.target.value)} required>
                      <option value="">Select a registered account</option>
                      {users.map((user) => (
                        <option key={user.identity.toHexString()} value={user.identity.toHexString()}>
                          {user.username} · {displayRole(user.role)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Assign role
                    <select value={newRole} onChange={(event) => setNewRole(event.target.value as AssignableRole)}>
                      <option>Employee</option>
                      <option>Admin</option>
                    </select>
                  </label>
                  <button className="button button-primary" type="submit" disabled={submitting || !connection}>
                    {submitting ? "Updating role..." : "Assign Role"}
                  </button>
                </form>
                <p className="auth-demo-notice">Role changes are authorized by the SpacetimeDB admin-only reducer.</p>
                  </>
                ) : (
                  <p className="auth-demo-notice">Only Admin users can invite members or assign roles.</p>
                )}
                <div className="auth-active-roster">
                  <span className="summary-label">ACME CORPORATION - ACTIVE RESPONDERS</span>
                  {users.length > 0 ? (
                    <div className="auth-role-list">
                      {users.map((user) => (
                        <article key={user.identity.toHexString()}>
                          <strong>{user.username}</strong>
                          <p>{displayRole(user.role)} · Active account</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="auth-demo-notice">No registered responders are available yet.</p>
                  )}
                </div>
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
                  Password
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required />
                </label>
                {mode === "register" && (
                  <label>
                    Responder role
                    <input value="Employee" readOnly />
                  </label>
                )}
                <p className="auth-demo-notice">{mode === "register" ? "Registration hashes the password with SHA-256 before sending it to the SpacetimeDB sign-up reducer." : "Your password is hashed with SHA-256 and verified by SpacetimeDB."}</p>
                {(error || connectionError) && <p className="auth-error" role="alert">{error || connectionError}</p>}
                <div className="modal-actions">
                  {session && <button className="button button-secondary" type="button" onClick={signOut}>Sign out</button>}
                  <button className="button button-primary" type="submit" disabled={submitting || !connection}>
                    {submitting ? mode === "register" ? "Registering..." : "Signing in..." : mode === "register" ? "Register Responder" : "Sign In"}
                  </button>
                </div>
              </form>
            )}
            {mode === "roles" && (error || connectionError) && <p className="auth-error" role="alert">{error || connectionError}</p>}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
