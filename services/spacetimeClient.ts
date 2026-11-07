import type { NemotronAnalysis } from './nemotron.js';

export interface SpacetimeReducerConnection {
  reducers: Record<string, {
    call(args: Record<string, unknown>): void | Promise<void>;
  }>;
}

export async function commitAiAnalysis(
  connection: SpacetimeReducerConnection,
  incidentId: bigint,
  analysis: NemotronAnalysis,
): Promise<void> {
  const reducer = connection.reducers.applyAiAnalysis;
  if (!reducer) throw new Error('Generated applyAiAnalysis reducer binding is not configured');
  await reducer.call({
    incidentId,
    classification: analysis.threatClassification,
    riskScore: analysis.riskScore,
    severity: analysis.severity,
    blastRadius: analysis.blastRadius,
    confidence: analysis.confidence,
    impactSummary: analysis.impactSummary,
    recommendations: JSON.stringify(analysis.recommendations),
    assets: JSON.stringify(analysis.assets),
    relationships: JSON.stringify(analysis.edges.map(edge => ({
      source: edge.sourceId,
      target: edge.targetId,
      relationLabel: edge.label,
    }))),
  });
}
