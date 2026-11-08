import { NextResponse } from "next/server";
import { analyzeWithNemotron, NemotronInputSchema } from "@/services/nemotron";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsedInput = NemotronInputSchema.safeParse(body);
  if (!parsedInput.success) {
    return NextResponse.json({ error: parsedInput.error.message }, { status: 400 });
  }

  try {
    const result = await analyzeWithNemotron(parsedInput.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Investigation analysis failed:", error);
    return NextResponse.json({ error: "Investigation analysis failed." }, { status: 500 });
  }
}
