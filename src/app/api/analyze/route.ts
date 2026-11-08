import { NextResponse } from "next/server";
import { analyzeWithNemotron, mockNemotron, NemotronInputSchema } from "@/services/nemotron";
import { DbConnection, tables } from "@/generated/spacetimedb";

function spacetimeDatabaseName(): string {
  const configured = process.env.SPACETIME_DB_NAME
    ?? process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE
    ?? "sentinelgraph-demo";
  return configured === "sentinelgraph" ? "sentinelgraph-demo" : configured;
}

async function incidentExists(incidentId: bigint, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let connection: DbConnection | null = null;
    const timer = setTimeout(() => {
      connection?.disconnect();
      reject(new Error("Timed out checking the incident in SpacetimeDB."));
    }, timeoutMs);

    connection = DbConnection.builder()
      .withUri(process.env.SPACETIME_DB_HOST ?? process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "http://localhost:3000")
      .withDatabaseName(spacetimeDatabaseName())
      .onConnect((connected) => {
        connected.subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            const normalizedIncidentId = incidentId.toString();
            const exists = Array.from(connected.db.incident.iter()).some(
              (row) => row.id.toString() === normalizedIncidentId,
            );
            connected.disconnect();
            resolve(exists);
          })
          .onError((error) => {
            clearTimeout(timer);
            connected.disconnect();
            reject(error instanceof Error ? error : new Error(String(error)));
          })
          .subscribe([tables.incident]);
      })
      .onConnectError((_context, error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      })
      .onDisconnect(() => undefined)
      .build();
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  let requestedIncidentId: bigint | null = null;
  if (body && typeof body === "object" && "incidentId" in body) {
    const rawIncidentId = (body as { incidentId?: unknown }).incidentId;
    try {
      const incidentId = BigInt(String(rawIncidentId ?? ""));
      if (incidentId < 1n) {
        return NextResponse.json(
          { error: "The incident ID must be a positive integer. Declare the incident before running AI analysis." },
          { status: 400 },
        );
      }
      requestedIncidentId = incidentId;
    } catch {
      return NextResponse.json(
        { error: "Invalid incident ID. Declare the incident from the Incident Command Hub before running AI analysis." },
        { status: 400 },
      );
    }
  }

  const parsedInput = NemotronInputSchema.safeParse(body);
  if (!parsedInput.success) {
    return NextResponse.json({ error: parsedInput.error.message }, { status: 400 });
  }

  if (requestedIncidentId !== null) {
    try {
      const exists = await incidentExists(requestedIncidentId);
      if (!exists) {
        if (requestedIncidentId === 1n) {
          const mockAnalysis = mockNemotron(parsedInput.data);
          return NextResponse.json({ analysis: mockAnalysis, source: "mock" }, { status: 200 });
        }
        return NextResponse.json(
          {
            error: `Incident #${requestedIncidentId.toString()} does not exist in SpacetimeDB. Declare it from the Incident Command Hub before running AI analysis.`,
            code: "INCIDENT_NOT_FOUND",
          },
          { status: 404 },
        );
      }
    } catch (error) {
      console.error("Unable to verify incident in SpacetimeDB:", error);
      const mockAnalysis = mockNemotron(parsedInput.data);
      return NextResponse.json({ analysis: mockAnalysis, source: "mock" }, { status: 200 });
    }
  }

  try {
    const result = await analyzeWithNemotron(parsedInput.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Investigation analysis failed:", error);
    return NextResponse.json({ error: "Investigation analysis failed." }, { status: 500 });
  }
}
