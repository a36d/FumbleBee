import { NextResponse } from 'next/server';
import {
  generateIncidentReport,
  reportToMarkdown,
} from '../../../../../services/report-generator';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: { id: string } },
) {
  let incidentId: bigint;
  try {
    incidentId = BigInt(context.params.id);
  } catch {
    return NextResponse.json({ error: 'Incident ID must be an integer.' }, { status: 400 });
  }

  let report;
  try {
    report = await generateIncidentReport(incidentId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to generate incident report.' },
      { status: 404 },
    );
  }

  const format = new URL(request.url).searchParams.get('format')?.toLowerCase();
  const filename = `incident-${context.params.id}-forensic-report.${format === 'json' ? 'json' : 'md'}`;
  if (format === 'json') {
    return new NextResponse(JSON.stringify(report, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return new NextResponse(reportToMarkdown(report), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
