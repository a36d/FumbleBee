import { NextResponse } from "next/server";
import { generateContainmentScript } from "@/services/nemotron";

export const runtime = "nodejs";

type MitigationBody = {
  assetId?: unknown;
  assetName?: unknown;
  assetType?: unknown;
  compromiseStatus?: unknown;
  asset?: {
    id?: unknown;
    name?: unknown;
    type?: unknown;
    description?: unknown;
    scopeStatus?: unknown;
  };
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid mitigation request." }, { status: 400 });
  }

  const input = body as MitigationBody;
  const assetId = String(input.assetId ?? input.asset?.id ?? "").trim();
  const assetName = String(input.assetName ?? input.asset?.name ?? "").trim();
  const assetType = String(input.assetType ?? input.asset?.type ?? "").trim();
  const compromiseStatus = String(
    input.compromiseStatus ?? input.asset?.scopeStatus ?? "Targeted",
  ).trim();
  const metadata = input.asset?.description
    ? String(input.asset.description)
    : undefined;

  if (!assetId || !assetName || !assetType || !compromiseStatus) {
    return NextResponse.json(
      {
        error: "assetId, assetName, assetType, and compromiseStatus are required.",
      },
      { status: 400 },
    );
  }

  try {
    const payload = await generateContainmentScript({
      id: assetId,
      name: assetName,
      type: assetType,
      compromiseStatus,
      metadata,
    });
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("[Nemotron] Containment script generation failed:", error);
    return NextResponse.json(
      { error: "Containment script generation failed." },
      { status: 500 },
    );
  }
}
