import { NextResponse } from "next/server";
import { resetDemo } from "../../../../scripts/reset-demo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Demo reset is only available in development." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  let sameOrigin = false;
  if (origin) {
    try {
      sameOrigin = new URL(origin).origin === new URL(request.url).origin;
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin) {
    return NextResponse.json({ error: "Reset requests must come from this application." }, { status: 403 });
  }

  try {
    resetDemo();
    return NextResponse.json({ success: true, message: "Incident state reset." });
  } catch (error) {
    console.error("Demo state reset failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Demo state reset failed." },
      { status: 500 },
    );
  }
}
