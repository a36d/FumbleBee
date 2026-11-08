"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  DbConnection,
} from "@/generated/spacetimedb";

export interface ResponderSessionProfile {
  username: string;
  role: "Admin" | "Employee";
  token?: string;
}

interface SpacetimeConnectionContextValue {
  connection: DbConnection | null;
  connectionError: string;
  responderSession: ResponderSessionProfile | null;
  sessionLoaded: boolean;
  saveSession: (profile: ResponderSessionProfile) => void;
  switchSession: (profile: ResponderSessionProfile) => void;
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
      return { username: parsed.username, role };
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
      .withDatabaseName("sentinelgraph")
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
    setResponderSession({ username: profile.username, role: profile.role });
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
      throw new Error("This responder has no saved SpacetimeDB session on this device.");
    }
    localStorage.setItem(sessionStorageKey, JSON.stringify(profile));
    setResponderSession({ username: profile.username, role: profile.role });
    window.location.reload();
  }

  return (
    <SpacetimeConnectionContext.Provider value={{ connection, connectionError, responderSession, sessionLoaded, saveSession, switchSession }}>
      {children}
    </SpacetimeConnectionContext.Provider>
  );
}

export function useSpacetimeConnection() {
  const context = useContext(SpacetimeConnectionContext);
  if (!context) throw new Error("useSpacetimeConnection must be used within SpacetimeConnectionProvider.");
  return context;
}
