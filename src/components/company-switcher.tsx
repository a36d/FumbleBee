"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useSpacetimeConnection } from "@/components/spacetime-connection-provider";
import { readImageFile } from "@/lib/image-upload";
import { normalizeRole } from "@/lib/roles";

interface Company {
  id: string;
  name: string;
  email: string;
  ownerUsername: string;
  invitedUsernames: string[];
  photoDataUrl?: string;
}

const companiesStorageKey = "fumblebee_companies";
const activeCompanyStorageKey = "fumblebee_active_company";

function isCompany(value: unknown): value is Company {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value && typeof value.id === "string" &&
    "name" in value && typeof value.name === "string" &&
    "email" in value && typeof value.email === "string" &&
    "ownerUsername" in value && typeof value.ownerUsername === "string" &&
    "invitedUsernames" in value && Array.isArray(value.invitedUsernames) &&
    value.invitedUsernames.every((username) => typeof username === "string") &&
    (!("photoDataUrl" in value) || typeof value.photoDataUrl === "string"),
  );
}

export function CompanySwitcher() {
  const { responderSession, sessionLoaded } = useSpacetimeConnection();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState("");
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhoto, setCompanyPhoto] = useState("");
  const [error, setError] = useState("");
  const [storageLoaded, setStorageLoaded] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const username = responderSession?.username.trim().toLowerCase() ?? "";
  const isAdmin = normalizeRole(responderSession?.role) === "Admin";

  useEffect(() => {
    if (!sessionLoaded) return;
    try {
      const savedCompanies: unknown = JSON.parse(localStorage.getItem(companiesStorageKey) ?? "[]");
      const allCompanies = Array.isArray(savedCompanies) ? savedCompanies.filter(isCompany) : [];
      setCompanies(allCompanies);
      const savedActive = localStorage.getItem(`${activeCompanyStorageKey}:${username}`);
      const visibleCompanies = allCompanies.filter((company) =>
        isAdmin
          ? company.ownerUsername.toLowerCase() === username
          : company.invitedUsernames.some((member) => member.toLowerCase() === username),
      );
      setActiveCompanyId(
        visibleCompanies.some((company) => company.id === savedActive)
          ? savedActive ?? ""
          : visibleCompanies[0]?.id ?? "",
      );
    } catch {
      setError("Saved company information could not be loaded.");
    } finally {
      setStorageLoaded(true);
    }
  }, [isAdmin, sessionLoaded, username]);

  useEffect(() => {
    if (!storageLoaded || !sessionLoaded) return;
    try {
      localStorage.setItem(companiesStorageKey, JSON.stringify(companies));
    } catch {
      setError("Company details could not be saved in this browser.");
    }
  }, [companies, sessionLoaded, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded || !username) return;
    try {
      if (activeCompanyId) localStorage.setItem(`${activeCompanyStorageKey}:${username}`, activeCompanyId);
      else localStorage.removeItem(`${activeCompanyStorageKey}:${username}`);
    } catch {
      setError("The active company selection could not be saved.");
    }
  }, [activeCompanyId, storageLoaded, username]);

  const visibleCompanies = useMemo(() => companies.filter((company) =>
    isAdmin
      ? company.ownerUsername.toLowerCase() === username
      : company.invitedUsernames.some((member) => member.toLowerCase() === username),
  ), [companies, isAdmin, username]);
  const activeCompany = visibleCompanies.find((company) => company.id === activeCompanyId) ?? null;
  const hasCompany = activeCompany !== null;

  useEffect(() => {
    if (!open) return;
    const closeMenu = (event: MouseEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function addCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !username) {
      setError("Sign in as an Admin to add a company.");
      return;
    }
    const cleanName = companyName.trim();
    const cleanEmail = companyEmail.trim().toLowerCase();
    if (!cleanName || !cleanEmail) {
      setError("Enter both a company name and company email.");
      return;
    }
    if (visibleCompanies.some((company) => company.name.toLowerCase() === cleanName.toLowerCase())) {
      setError("You have already added a company with this name.");
      return;
    }

    const newCompany: Company = {
      id: crypto.randomUUID(),
      name: cleanName,
      email: cleanEmail,
      ownerUsername: username,
      invitedUsernames: [],
      ...(companyPhoto ? { photoDataUrl: companyPhoto } : {}),
    };
    const nextCompanies = [...companies, newCompany];
    try {
      localStorage.setItem(companiesStorageKey, JSON.stringify(nextCompanies));
      localStorage.setItem(`${activeCompanyStorageKey}:${username}`, newCompany.id);
      setCompanies(nextCompanies);
      setActiveCompanyId(newCompany.id);
      setCompanyName("");
      setCompanyEmail("");
      setCompanyPhoto("");
      setShowAddForm(false);
      setError("");
    } catch {
      setError("Company details could not be saved in this browser.");
    }
  }

  function removeCompany(company: Company) {
    if (
      !isAdmin ||
      !username ||
      company.ownerUsername.toLowerCase() !== username
    ) {
      setError("Only an Admin who owns this company can remove it.");
      return;
    }
    if (!window.confirm(`Remove ${company.name}? This cannot be undone.`)) return;

    const nextCompanies = companies.filter((savedCompany) => savedCompany.id !== company.id);
    const nextActiveCompanyId = activeCompanyId === company.id
      ? visibleCompanies.find((visibleCompany) => visibleCompany.id !== company.id)?.id ?? ""
      : activeCompanyId;

    try {
      localStorage.setItem(companiesStorageKey, JSON.stringify(nextCompanies));
      if (nextActiveCompanyId) {
        localStorage.setItem(`${activeCompanyStorageKey}:${username}`, nextActiveCompanyId);
      } else {
        localStorage.removeItem(`${activeCompanyStorageKey}:${username}`);
      }
      setCompanies(nextCompanies);
      setActiveCompanyId(nextActiveCompanyId);
      setError("");
    } catch {
      setError("Company could not be removed from this browser.");
    }
  }

  return (
    <div className="company-switcher" ref={switcherRef}>
      <button
        type="button"
        className={`workspace-switch ${!hasCompany ? "workspace-switch-unconfigured" : ""}`}
        onClick={() => { setOpen((current) => !current); setError(""); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={hasCompany ? `Select company, current company ${activeCompany?.name ?? "not selected"}` : "Company setup required"}
      >
        <span className={`workspace-icon ${!hasCompany ? "workspace-icon-warning" : ""}`}>
          {hasCompany && activeCompany?.photoDataUrl
            ? <img src={activeCompany.photoDataUrl} alt="" />
            : hasCompany
              ? (activeCompany?.name.charAt(0).toUpperCase() ?? <Building2 size={15} />)
              : <AlertTriangle size={15} />}
        </span>
        <span className="workspace-copy">
          <strong>{activeCompany?.name ?? "Company setup required"}</strong>
          <small>{!sessionLoaded ? "Loading account..." : hasCompany ? activeCompany?.email : isAdmin ? "Add your company to continue" : "Awaiting an Admin invitation"}</small>
        </span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="company-menu" role="dialog" aria-label="Company selector">
          <div className="company-menu-heading">
            <div><span>ORGANIZATION</span><strong>{isAdmin ? "Your companies" : "Your memberships"}</strong></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close company menu"><X size={15} /></button>
          </div>

          {visibleCompanies.map((company) => (
            <div className="company-menu-row" key={company.id}>
              <button
                type="button"
                className={`company-menu-item ${activeCompanyId === company.id ? "active" : ""}`}
                onClick={() => { setActiveCompanyId(company.id); setShowAddForm(false); }}
              >
                <span className="company-menu-icon">
                  {company.photoDataUrl ? <img src={company.photoDataUrl} alt="" /> : <Building2 size={15} />}
                </span>
                <span><strong>{company.name}</strong><small>{company.email}</small></span>
                {activeCompanyId === company.id && <Check size={15} />}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="company-remove-button"
                  aria-label={`Remove ${company.name}`}
                  title={`Remove ${company.name}`}
                  onClick={() => removeCompany(company)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          <div className="company-empty-slot">
            <AlertTriangle size={16} />
            <div>
              <strong>{isAdmin ? "Company not configured" : "No company invitations yet"}</strong>
              <small>{isAdmin ? "Add a company name and company email to set up this workspace." : "An Admin invitation will appear here when available."}</small>
            </div>
          </div>

          {isAdmin && !showAddForm && (
            <button className="company-add-trigger" type="button" onClick={() => { setShowAddForm(true); setError(""); }}>
              <Plus size={15} /> Add company
            </button>
          )}

          {isAdmin && showAddForm && (
            <form className="company-add-form" onSubmit={addCompany}>
              <label>
                Company name
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Your company name" maxLength={120} required />
              </label>
              <label>
                Company email
                <input type="email" value={companyEmail} onChange={(event) => setCompanyEmail(event.target.value)} placeholder="security@company.com" maxLength={254} required />
              </label>
              <label>
                Company photo <span>(optional)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;
                    try {
                      setCompanyPhoto(await readImageFile(file));
                      setError("");
                    } catch (uploadError) {
                      setCompanyPhoto("");
                      setError(uploadError instanceof Error ? uploadError.message : "The selected image could not be read.");
                      input.value = "";
                    }
                  }}
                />
              </label>
              {companyPhoto && (
                <div className="company-photo-preview">
                  <img src={companyPhoto} alt="Company photo preview" />
                  <button type="button" className="company-cancel-button" onClick={() => setCompanyPhoto("")}>Remove photo</button>
                </div>
              )}
              {error && <p role="alert">{error}</p>}
              <div>
                <button className="company-cancel-button" type="button" onClick={() => { setShowAddForm(false); setCompanyPhoto(""); setError(""); }}>Cancel</button>
                <button className="company-save-button" type="submit"><Plus size={14} /> Add company</button>
              </div>
            </form>
          )}
          {error && !showAddForm && <p className="company-menu-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
