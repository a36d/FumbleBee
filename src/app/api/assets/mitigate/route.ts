import { NextResponse } from 'next/server';
import { generateContainmentScript } from '@/services/nemotron';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid mitigation request.' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const assetId = typeof input.assetId === 'string' || typeof input.assetId === 'number' || typeof input.assetId === 'bigint'
    ? String(input.assetId)
    : '';
  const assetName = typeof input.assetName === 'string' ? input.assetName.trim() : '';
  const assetType = typeof input.assetType === 'string' ? input.assetType.trim() : '';
  const compromiseStatus = typeof input.compromiseStatus === 'string' ? input.compromiseStatus.trim() : '';

  if (!assetId || !assetName || !assetType || !compromiseStatus) {
    return NextResponse.json(
      { error: 'assetId, assetName, assetType, and compromiseStatus are required.' },
      { status: 400 },
    );
  }

  try {
    const result = await generateContainmentScript({
      id: assetId,
      name: assetName,
      type: assetType,
      compromiseStatus,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[Nemotron] Containment script generation failed:', error);
    return NextResponse.json({ error: 'Containment script generation failed.' }, { status: 500 });
  }
}
