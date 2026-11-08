"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, KeyRound, Loader2, Mail, Save, ShieldAlert, UserRound, X } from "lucide-react";
import { tables } from "@/generated/spacetimedb";
import type { Incident, User } from "@/generated/spacetimedb/types";
import { useSpacetimeConnection } from "@/components/spacetime-connection-provider";
import { hashPassphrase } from "@/lib/auth";

function riskLabel(score: number): string {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 35) return "Moderate";
  return "Low";
}

export function ProfileDialog() {
  const { connection, connectionError, responderSession } = useSpacetimeConnection();
  const session = responderSession;
  const [profile, setProfile] = useState<User | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassphrase, setSavingPassphrase] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!connection) {
      setProfile(null);
      setIncidents([]);
      return;
    }

    let active = true;
    const refresh = () => {
      if (!active) return;
      const users = Array.from(connection.db.user.iter());
      const current = session
        ? users.find((user) => user.username === session.username) ?? null
        : null;
      setProfile(current);
      setIncidents(Array.from(connection.db.incident.iter()));
    };
    connection.db.user.onInsert(refresh);
    connection.db.user.onUpdate(refresh);
    connection.db.user.onDelete(refresh);
    connection.db.incident.onInsert(refresh);
    connection.db.incident.onUpdate(refresh);
    connection.db.incident.onDelete(refresh);
    const subscription = connection.subscriptionBuilder()
      .onApplied(refresh)
      .onError((context) => {
        if (active) setError(`Could not load profile data: ${context.event?.message ?? "unknown subscription error"}`);
      })
      .subscribe([tables.user, tables.incident]);

    return () => {
      active = false;
      connection.db.user.removeOnInsert(refresh);
      connection.db.user.removeOnUpdate(refresh);
      connection.db.user.removeOnDelete(refresh);
      connection.db.incident.removeOnInsert(refresh);
      connection.db.incident.removeOnUpdate(refresh);
      connection.db.incident.removeOnDelete(refresh);
      subscription.unsubscribe();
    };
  }, [connection, session]);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setEmail(profile.email);
  }, [profile]);

  const relatedIncidents = useMemo(() => {
    if (!profile) return [];
    const identifiers = new Set([profile.username, profile.name].map((value) => value.trim().toLowerCase()));
    return incidents.filter((incident) => identifiers.has(incident.subjectName.trim().toLowerCase()));
  }, [incidents, profile]);
  const personalRisk = relatedIncidents.reduce((highest, incident) => Math.max(highest, Number(incident.riskScore)), 0);
  const riskStatus = relatedIncidents.length ? riskLabel(personalRisk) : "No direct exposure";
  const initials = (profile?.name || session?.username || "U").slice(0, 2).toUpperCase();

  async function saveContactInfo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connection || !profile) {
      setError(connectionError || "Sign in and connect to SpacetimeDB to update contact information.");
      return;
    }
    setSavingProfile(true);
    setError("");
    setNotice("");
    try {
      await connection.reducers.updateUserProfile({ name: name.trim(), email: email.trim() });
      setNotice("Contact information updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update contact information.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveNewPassphrase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connection || !profile) {
      setError(connectionError || "Sign in and connect to SpacetimeDB to change your passphrase.");
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      setError("New passphrases do not match.");
      return;
    }
    setSavingPassphrase(true);
    setError("");
    setNotice("");
    try {
      const [currentPassphraseHash, newPassphraseHash] = await Promise.all([
        hashPassphrase(currentPassphrase),
        hashPassphrase(newPassphrase),
      ]);
      await connection.reducers.changeUserPassphrase({ currentPassphraseHash, newPassphraseHash });
      setCurrentPassphrase("");
      setNewPassphrase("");
      setConfirmPassphrase("");
      setNotice("Passphrase updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not change passphrase.");
    } finally {
      setSavingPassphrase(false);
    }
  }

  function showDialog() {
    setError("");
    setNotice("");
    setOpen(true);
  }

  return (
    <>
      <button className="profile-button" type="button" onClick={showDialog} aria-haspopup="dialog">
        <span className="avatar avatar-green">{initials}</span>
        <span className="profile-copy">
          <strong>{profile?.name ?? session?.username ?? "My profile"}</strong>
          <small>{profile?.role ?? (session ? "Responder" : "Sign in to manage profile")}</small>
        </span>
        <UserRound size={14} />
      </button>

      {open && createPortal(
        <div className="modal-backdrop profile-dialog-backdrop" onClick={() => setOpen(false)}>
          <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" onClick={(event) => event.stopPropagation()}>
            <header className="profile-dialog-header">
              <div className="profile-identity">
                <span className="profile-dialog-avatar">{initials}</span>
                <div>
                  <span className="profile-eyebrow">RESPONDER ACCOUNT</span>
                  <h2 id="profile-dialog-title">{profile?.name ?? session?.username ?? "Your profile"}</h2>
                  <p>{profile ? `${profile.username} · ${profile.role}` : "Sign in to manage your account"}</p>
                </div>
              </div>
              <button className="profile-close" type="button" onClick={() => setOpen(false)} aria-label="Close profile"><X size={18} /></button>
            </header>

            {!session ? (
              <div className="profile-offline-state">
                <ShieldAlert size={20} />
                <div>
                  <strong>No active responder session</strong>
                  <p>Sign in from the top bar to edit contact information, change your passphrase, and view account-linked risk.</p>
                </div>
              </div>
            ) : (
              <>
                {!connection && <p className="profile-connection-note">{connectionError || "Waiting for SpacetimeDB connection. Profile changes are unavailable while offline."}</p>}
                {session && connection && !profile && <p className="profile-connection-note">Could not find this responder account in the connected database.</p>}

                <div className="profile-risk-card" data-risk={riskLabel(personalRisk).toLowerCase()}>
                  <div className="profile-risk-icon"><ShieldAlert size={18} /></div>
                  <div className="profile-risk-copy">
                    <span>PERSONAL RISK EXPOSURE</span>
                    <strong>{riskStatus}</strong>
                    <small>
                      {relatedIncidents.length
                        ? `${relatedIncidents.length} linked incident${relatedIncidents.length === 1 ? "" : "s"} · highest incident score`
                        : "No incident subject currently matches this account."}
                    </small>
                  </div>
                  <div className="profile-risk-score">{relatedIncidents.length ? personalRisk : "—"}<small>{relatedIncidents.length ? "/ 100" : "score"}</small></div>
                </div>
                {relatedIncidents.length > 0 && (
                  <div className="profile-risk-incidents">
                    {relatedIncidents.map((incident) => (
                      <div key={incident.id.toString()}>
                        <span>#{incident.id.toString()} · {incident.title}</span>
                        <strong data-risk={riskLabel(Number(incident.riskScore)).toLowerCase()}>{incident.riskScore}</strong>
                      </div>
                    ))}
                  </div>
                )}

                <form className="profile-settings-form" onSubmit={saveContactInfo}>
                  <div className="profile-section-heading"><Mail size={15} /><h3>Contact information</h3></div>
                  <label>
                    Display name
                    <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
                  </label>
                  <label>
                    Email address
                    <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />
                  </label>
                  <button className="profile-submit" type="submit" disabled={!connection || !profile || savingProfile || !name.trim() || !email.trim()}>
                    {savingProfile ? <Loader2 className="profile-spinner" size={15} /> : <Save size={15} />}
                    {savingProfile ? "Saving contact info..." : "Save contact info"}
                  </button>
                </form>

                <form className="profile-settings-form profile-password-form" onSubmit={saveNewPassphrase}>
                  <div className="profile-section-heading"><KeyRound size={15} /><h3>Change passphrase</h3></div>
                  <label>
                    Current passphrase
                    <input type="password" autoComplete="current-password" value={currentPassphrase} onChange={(event) => setCurrentPassphrase(event.target.value)} required />
                  </label>
                  <div className="profile-password-row">
                    <label>
                      New passphrase
                      <input type="password" autoComplete="new-password" value={newPassphrase} onChange={(event) => setNewPassphrase(event.target.value)} minLength={8} required />
                    </label>
                    <label>
                      Confirm new passphrase
                      <input type="password" autoComplete="new-password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} minLength={8} required />
                    </label>
                  </div>
                  <p className="profile-form-hint">Use at least 8 characters. Your current passphrase is required to make this change.</p>
                  <button className="profile-submit profile-submit-secondary" type="submit" disabled={!connection || !profile || savingPassphrase || !currentPassphrase || newPassphrase.length < 8 || !confirmPassphrase}>
                    {savingPassphrase ? <Loader2 className="profile-spinner" size={15} /> : <KeyRound size={15} />}
                    {savingPassphrase ? "Updating passphrase..." : "Update passphrase"}
                  </button>
                </form>

                {(error || notice) && (
                  <p className={error ? "profile-feedback profile-error" : "profile-feedback profile-success"}>
                    {error ? <ShieldAlert size={14} /> : <CircleCheck size={14} />}
                    {error || notice}
                  </p>
                )}
              </>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
