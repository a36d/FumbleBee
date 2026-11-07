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
    classification: analysis.classification,
    riskScore: analysis.riskScore,
    severity: analysis.severity,
    blastRadius: analysis.blastRadius,
    confidence: analysis.confidence,
    summary: analysis.summary,
    affectedAssets: analysis.affectedAssets,
    attackGraphEdges: analysis.attackGraphEdges,
    recommendations: analysis.recommendations,
  });
}
