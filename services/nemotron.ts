import { z } from 'zod';

export const NemotronInputSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  notes: z.array(z.string()),
});

export const NemotronAnalysisSchema = z.object({
  classification: z.string(),
  riskScore: z.number().int().min(0).max(100),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  blastRadius: z.number().int().min(0),
  confidence: z.number().int().min(0).max(100),
  summary: z.string(),
  affectedAssets: z.array(z.string()),
  attackGraphEdges: z.array(z.object({
    source: z.string(),
    target: z.string(),
    relationLabel: z.string(),
  })),
  recommendations: z.array(z.string()),
});

export type NemotronInput = z.infer<typeof NemotronInputSchema>;
export type NemotronAnalysis = z.infer<typeof NemotronAnalysisSchema>;

export interface NemotronOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
}

export function mockNemotron(input: NemotronInput): NemotronAnalysis {
  const text = `${input.title} ${input.description} ${input.notes.join(' ')}`.toLowerCase();
  const isExfiltration = /exfil|download|cloud|upload|archive/.test(text);
  const isPrivilege = /admin|privilege|credential|account/.test(text);
  const riskScore = Math.min(100, 35 + input.notes.length * 4 + (isExfiltration ? 30 : 0) + (isPrivilege ? 15 : 0));
  const severity = riskScore >= 85 ? 'Critical' : riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Medium' : 'Low';
  const subject = input.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'subject';

  return {
    classification: isExfiltration ? 'Potential Data Exfiltration' : isPrivilege ? 'Privilege Abuse' : 'Suspicious User Behavior',
    riskScore,
    severity,
    blastRadius: isExfiltration ? 6 : 3,
    confidence: isExfiltration ? 92 : 78,
    summary: `Mock analysis indicates ${isExfiltration ? 'possible data exfiltration activity' : 'suspicious insider activity'} involving ${subject}.`,
    affectedAssets: ['Identity Center', 'Corporate Endpoint', ...(isExfiltration ? ['Cloud Storage'] : [])],
    attackGraphEdges: [
      { source: subject, target: 'Corporate Endpoint', relationLabel: 'accessed' },
      ...(isExfiltration ? [{ source: 'Corporate Endpoint', target: 'Cloud Storage', relationLabel: 'uploaded sensitive data' }] : []),
      ...(isPrivilege ? [{ source: subject, target: 'Identity Center', relationLabel: 'abused elevated access' }] : []),
    ],
    recommendations: [
      'Preserve relevant endpoint and identity-center logs.',
      'Revoke active sessions and validate current access controls.',
      'Notify the designated insider-risk response team.',
    ],
  };
}

export async function analyzeWithNemotron(
  rawInput: NemotronInput,
  options: NemotronOptions = {},
): Promise<{ analysis: NemotronAnalysis; source: 'nemotron' | 'mock' }> {
  const input = NemotronInputSchema.parse(rawInput);
  const apiKey = options.apiKey ?? process.env.NVIDIA_API_KEY;
  if (!apiKey) return { analysis: mockNemotron(input), source: 'mock' };

  const endpoint = options.endpoint ?? process.env.NVIDIA_API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions';
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const requestSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      classification: { type: 'string' },
      riskScore: { type: 'integer', minimum: 0, maximum: 100 },
      severity: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
      blastRadius: { type: 'integer', minimum: 0 },
      confidence: { type: 'integer', minimum: 0, maximum: 100 },
      summary: { type: 'string' },
      affectedAssets: { type: 'array', items: { type: 'string' } },
      attackGraphEdges: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            relationLabel: { type: 'string' },
          },
          required: ['source', 'target', 'relationLabel'],
        },
      },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'classification', 'riskScore', 'severity', 'blastRadius', 'confidence',
      'summary', 'affectedAssets', 'attackGraphEdges', 'recommendations',
    ],
  };

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model ?? process.env.NVIDIA_NEMOTRON_MODEL ?? 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        messages: [
          {
            role: 'system',
            content: 'You are a cybersecurity insider-threat analyst. Return only a valid JSON object matching the provided schema.',
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'sentinelgraph_analysis', strict: true, schema: requestSchema },
        },
      }),
    });
    if (!response.ok) throw new Error(`Nemotron API returned ${response.status}`);
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Nemotron API returned no content');
    const parsed = NemotronAnalysisSchema.safeParse(JSON.parse(content));
    if (!parsed.success) throw new Error(`Nemotron returned invalid analysis: ${parsed.error.message}`);
    return { analysis: parsed.data, source: 'nemotron' };
  } catch (error) {
    console.warn('Nemotron unavailable; using mock analysis:', error instanceof Error ? error.message : String(error));
    return { analysis: mockNemotron(input), source: 'mock' };
  }
}
