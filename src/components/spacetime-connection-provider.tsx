"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  DbConnection,
} from "@/generated/spacetimedb";

export interface ResponderSessionProfile {
  username: string;
  role: string;
}

interface SpacetimeConnectionContextValue {
  connection: DbConnection | null;
  connectionError: string;
  saveSession: (profile: ResponderSessionProfile) => void;
}

const sessionStorageKey = "fumblebee_session";
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

export function SpacetimeConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [authToken, setAuthToken] = useState<string | null>(null);

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
    if (!authToken) {
      throw new Error("SpacetimeDB has not issued a responder session token.");
    }
    localStorage.setItem(sessionStorageKey, JSON.stringify({ ...profile, token: authToken }));
  }

  return (
    <SpacetimeConnectionContext.Provider value={{ connection, connectionError, saveSession }}>
      {children}
    </SpacetimeConnectionContext.Provider>
  );
}

export function useSpacetimeConnection() {
  const context = useContext(SpacetimeConnectionContext);
  if (!context) throw new Error("useSpacetimeConnection must be used within SpacetimeConnectionProvider.");
  return context;
}
