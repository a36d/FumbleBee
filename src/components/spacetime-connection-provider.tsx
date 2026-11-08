"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  DbConnection,
} from "@/generated/spacetimedb";

export interface ResponderSessionProfile {
  username: string;
  role: "Admin" | "Employee";
  token?: string;
  avatarDataUrl?: string;
}

interface SpacetimeConnectionContextValue {
  connection: DbConnection | null;
  connectionError: string;
  responderSession: ResponderSessionProfile | null;
  sessionLoaded: boolean;
  saveSession: (profile: ResponderSessionProfile) => void;
  switchSession: (profile: ResponderSessionProfile) => void;
  updateResponderPhoto: (avatarDataUrl: string | undefined, email?: string) => void;
}

const sessionStorageKey = "fumblebee_session";
const responderSessionsStorageKey = "fumblebee_responder_sessions";
const SpacetimeConnectionContext = createContext<SpacetimeConnectionContextValue | null>(null);

function readSavedToken(): string | undefined {
  try {
    const saved = localStorage.getItem(sessionStorageKey);
    if (!saved) return undefined;
    const parsed: unknown = JSON.parse(saved);
    if (parsed && typeof parsed === "object" && "token" in parsed && typeof parsed.token === "string") {
      return parsed.token;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function readSavedProfile(): ResponderSessionProfile | null {
  try {
    const saved = localStorage.getItem(sessionStorageKey) ?? localStorage.getItem("fumblebee_responder");
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (
      parsed &&
      typeof parsed === "object" &&
      "username" in parsed &&
      typeof parsed.username === "string" &&
      "role" in parsed &&
      typeof parsed.role === "string"
    ) {
      const role = parsed.role === "Admin" || parsed.role === "admin" ? "Admin" : "Employee";
      return {
        username: parsed.username,
        role,
        ...("avatarDataUrl" in parsed && typeof parsed.avatarDataUrl === "string"
          ? { avatarDataUrl: parsed.avatarDataUrl }
          : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function SpacetimeConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [responderSession, setResponderSession] = useState<ResponderSessionProfile | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    setResponderSession(readSavedProfile());
    setSessionLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    const builder = DbConnection.builder()
      .withUri("http://localhost:3000")
      .withDatabaseName("sentinelgraph-demo")
      .withAutomaticReconnect();
    const savedToken = readSavedToken();
    if (savedToken) builder.withToken(savedToken);

    const dbConnection = builder
      .onConnect((connected, _identity, token) => {
        if (active) {
          setAuthToken(token);
          setConnectionError("");
          setConnection(connected);
        }
      })
      .onAutomaticReconnect((connected, _identity, token) => {
        if (active) {
          setAuthToken(token);
          setConnectionError("");
          setConnection(connected);
        }
      })
      .onConnectError((_context, error) => {
        if (active) setConnectionError(`SpacetimeDB connection failed: ${error.message}`);
      })
      .onDisconnect((_context, error) => {
        if (active) {
          setConnection(null);
          if (error) setConnectionError(`SpacetimeDB disconnected: ${error.message}`);
        }
      })
      .build();

    return () => {
      active = false;
      dbConnection.disconnect();
    };
  }, []);

  function saveSession(profile: ResponderSessionProfile) {
    const savedProfile = authToken ? { ...profile, token: authToken } : profile;
    setResponderSession({
      username: profile.username,
      role: profile.role,
      ...(profile.avatarDataUrl ? { avatarDataUrl: profile.avatarDataUrl } : {}),
    });
    localStorage.setItem(sessionStorageKey, JSON.stringify(savedProfile));
    if (!authToken) return;
    const storedSessions = localStorage.getItem(responderSessionsStorageKey);
    const sessions: ResponderSessionProfile[] = storedSessions ? JSON.parse(storedSessions) as ResponderSessionProfile[] : [];
    const updatedSessions = [
      ...sessions.filter((session) => session.username !== profile.username),
      savedProfile,
    ];
    localStorage.setItem(responderSessionsStorageKey, JSON.stringify(updatedSessions));
  }

  function switchSession(profile: ResponderSessionProfile) {
    if (!profile.token) {
      throw new Error("This account has no saved SpacetimeDB session on this device.");
    }
    localStorage.setItem(sessionStorageKey, JSON.stringify(profile));
    setResponderSession({
      username: profile.username,
      role: profile.role,
      ...(profile.avatarDataUrl ? { avatarDataUrl: profile.avatarDataUrl } : {}),
    });
    window.location.reload();
  }

  function updateResponderPhoto(avatarDataUrl: string | undefined, email?: string) {
    if (!responderSession) throw new Error("Sign in before updating your profile photo.");

    const updatedSession: ResponderSessionProfile = {
      username: responderSession.username,
      role: responderSession.role,
      ...(responderSession.token ? { token: responderSession.token } : {}),
      ...(avatarDataUrl ? { avatarDataUrl } : {}),
    };

    const savedSessionValue = localStorage.getItem(sessionStorageKey);
    if (savedSessionValue) {
      const savedSession: unknown = JSON.parse(savedSessionValue);
      if (savedSession && typeof savedSession === "object" && "token" in savedSession && typeof savedSession.token === "string") {
        updatedSession.token = savedSession.token;
      }
    }

    const localRespondersValue: unknown = JSON.parse(localStorage.getItem("fumblebee_local_responders") ?? "[]");
    const localResponders = Array.isArray(localRespondersValue) ? localRespondersValue : [];
    const responderIndex = localResponders.findIndex((responder) =>
      responder && typeof responder === "object" &&
      "name" in responder && typeof responder.name === "string" &&
      responder.name.toLowerCase() === responderSession.username.toLowerCase(),
    );
    const existingResponder = responderIndex >= 0 ? localResponders[responderIndex] : null;
    const updatedResponder = {
      ...(existingResponder && typeof existingResponder === "object" ? existingResponder : {}),
      name: responderSession.username,
      email: email ?? (existingResponder && typeof existingResponder === "object" && "email" in existingResponder && typeof existingResponder.email === "string" ? existingResponder.email : ""),
      role: responderSession.role,
      timestamp: Date.now(),
      ...(avatarDataUrl ? { photoDataUrl: avatarDataUrl } : {}),
    };
    if (!avatarDataUrl) delete updatedResponder.photoDataUrl;
    const nextLocalResponders = [...localResponders];
    if (responderIndex >= 0) nextLocalResponders[responderIndex] = updatedResponder;
    else nextLocalResponders.push(updatedResponder);

    const storedSessionsValue: unknown = JSON.parse(localStorage.getItem(responderSessionsStorageKey) ?? "[]");
    const storedSessions = Array.isArray(storedSessionsValue) ? storedSessionsValue : [];
    const nextSavedSessions = storedSessions.map((savedProfile) => {
      if (
        !savedProfile ||
        typeof savedProfile !== "object" ||
        !("username" in savedProfile) ||
        typeof savedProfile.username !== "string" ||
        savedProfile.username.toLowerCase() !== responderSession.username.toLowerCase()
      ) return savedProfile;
      return {
        ...savedProfile,
        ...(avatarDataUrl ? { avatarDataUrl } : {}),
        ...(!avatarDataUrl ? { avatarDataUrl: undefined } : {}),
      };
    });

    localStorage.setItem(sessionStorageKey, JSON.stringify(updatedSession));
    localStorage.setItem("fumblebee_active_responder", JSON.stringify(updatedSession));
    localStorage.setItem("fumblebee_local_responders", JSON.stringify(nextLocalResponders));
    if (storedSessions.length > 0) {
      localStorage.setItem(responderSessionsStorageKey, JSON.stringify(nextSavedSessions));
    }
    setResponderSession(updatedSession);
  }

  return (
    <SpacetimeConnectionContext.Provider value={{ connection, connectionError, responderSession, sessionLoaded, saveSession, switchSession, updateResponderPhoto }}>
      {children}
    </SpacetimeConnectionContext.Provider>
  );
}

export function useSpacetimeConnection() {
  const context = useContext(SpacetimeConnectionContext);
  if (!context) throw new Error("useSpacetimeConnection must be used within SpacetimeConnectionProvider.");
  return context;
}
