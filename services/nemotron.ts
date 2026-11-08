import { z } from 'zod';

export const NemotronInputSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  notes: z.array(z.string()),
});

export const NemotronAnalysisSchema = z.object({
  threatClassification: z.string(),
  riskScore: z.number().int().min(0).max(100),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  blastRadius: z.number().int().min(0),
  confidence: z.number().int().min(0).max(100),
  impactSummary: z.string(),
  recommendations: z.array(z.string()),
  assets: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    type: z.enum(['identity', 'share', 'database', 'resource']),
    description: z.string(),
    riskLabel: z.enum(['Low', 'Medium', 'High', 'Critical']),
  })),
  edges: z.array(z.object({
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
    label: z.string(),
  })),
});

export type NemotronInput = z.infer<typeof NemotronInputSchema>;
export type NemotronAnalysis = z.infer<typeof NemotronAnalysisSchema>;

export interface NemotronOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface ContainmentAsset {
  id: string;
  name: string;
  type: string;
  compromiseStatus: string;
  metadata?: string;
}

export interface ContainmentScript {
  command: string;
  description: string;
  executionEnvironment: 'aws-cli' | 'bash' | 'powershell';
}

export const ContainmentScriptSchema = z.object({
  command: z.string().min(1),
  description: z.string().min(1),
  executionEnvironment: z.enum(['aws-cli', 'bash', 'powershell']),
});

function mockContainmentScript(asset: ContainmentAsset): ContainmentScript {
  const normalizedType = asset.type.toLowerCase();
  if (normalizedType === 'identity') {
    return {
      command: `Disable-ADAccount -Identity "${asset.name.replace(/"/g, '`\"`')}"`,
      description: `Disable the compromised identity ${asset.name} to prevent further authenticated actions.`,
      executionEnvironment: 'powershell',
    };
  }
  if (normalizedType === 'share' || normalizedType === 'database') {
    return {
      command: `aws ec2 stop-instances --instance-ids "${asset.id}"`,
      description: `Stop the compromised cloud asset ${asset.name} to halt active access and containment-sensitive operations.`,
      executionEnvironment: 'aws-cli',
    };
  }
  return {
    command: `iptables -A OUTPUT -d "${asset.id}" -j DROP`,
    description: `Block outbound traffic to the compromised network asset ${asset.name} immediately.`,
    executionEnvironment: 'bash',
  };
}

export function mockNemotron(input: NemotronInput): NemotronAnalysis {
  const text = `${input.title} ${input.description} ${input.notes.join(' ')}`.toLowerCase();
  const isExfiltration = /exfil|download|cloud|upload|archive/.test(text);
  const isPrivilege = /admin|privilege|credential|account/.test(text);
  const riskScore = Math.min(100, 35 + input.notes.length * 4 + (isExfiltration ? 30 : 0) + (isPrivilege ? 15 : 0));
  const severity = riskScore >= 85 ? 'Critical' : riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Medium' : 'Low';
  const subject = input.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'subject';

  return {
    threatClassification: isExfiltration ? 'Potential Data Exfiltration' : isPrivilege ? 'Privilege Abuse' : 'Suspicious User Behavior',
    riskScore,
    severity,
    blastRadius: isExfiltration ? 6 : 3,
    confidence: isExfiltration ? 92 : 78,
    impactSummary: `Mock analysis indicates ${isExfiltration ? 'possible data exfiltration activity' : 'suspicious insider activity'} involving ${subject}.`,
    recommendations: [
      'Preserve relevant endpoint and identity-center logs.',
      'Revoke active sessions and validate current access controls.',
      'Notify the designated insider-risk response team.',
    ],
    assets: [
      {
        id: subject,
        name: subject,
        type: 'identity',
        description: 'User identity associated with the suspicious activity.',
        riskLabel: severity,
      },
      {
        id: 'corporate-endpoint',
        name: 'Corporate Endpoint',
        type: 'share',
        description: 'Managed endpoint involved in the observed activity.',
        riskLabel: severity,
      },
      ...(isExfiltration ? [{
        id: 'cloud-storage',
        name: 'Cloud Storage',
        type: 'database' as const,
        description: 'External storage destination potentially used for data transfer.',
        riskLabel: 'Critical' as const,
      }] : []),
      ...(isPrivilege ? [{
        id: 'identity-center',
        name: 'Identity Center',
        type: 'resource' as const,
        description: 'Identity and access management system.',
        riskLabel: 'High' as const,
      }] : []),
    ],
    edges: [
      { sourceId: subject, targetId: 'corporate-endpoint', label: 'accessed' },
      ...(isExfiltration ? [{ sourceId: 'corporate-endpoint', targetId: 'cloud-storage', label: 'uploaded sensitive data' }] : []),
      ...(isPrivilege ? [{ sourceId: subject, targetId: 'identity-center', label: 'abused elevated access' }] : []),
    ],
  };
}

export async function analyzeWithNemotron(
  rawInput: NemotronInput,
  options: NemotronOptions = {},
): Promise<{ analysis: NemotronAnalysis; source: 'nemotron' | 'mock' }> {
  const input = NemotronInputSchema.parse(rawInput);
  const apiKey = options.apiKey ?? process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.warn('[Nemotron] Falling back to structured mock data (NVIDIA_API_KEY is not set)');
    return { analysis: mockNemotron(input), source: 'mock' };
  }

  const endpoint = options.endpoint ?? process.env.NVIDIA_API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions';
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  const requestSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      threatClassification: { type: 'string' },
      riskScore: { type: 'integer', minimum: 0, maximum: 100 },
      severity: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
      blastRadius: { type: 'integer', minimum: 0 },
      confidence: { type: 'integer', minimum: 0, maximum: 100 },
      impactSummary: { type: 'string' },
      recommendations: { type: 'array', items: { type: 'string' } },
      assets: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', minLength: 1 },
            name: { type: 'string' },
            type: { type: 'string', enum: ['identity', 'share', 'database', 'resource'] },
            description: { type: 'string' },
            riskLabel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
          },
          required: ['id', 'name', 'type', 'description', 'riskLabel'],
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceId: { type: 'string', minLength: 1 },
            targetId: { type: 'string', minLength: 1 },
            label: { type: 'string' },
          },
          required: ['sourceId', 'targetId', 'label'],
        },
      },
    },
    required: [
      'threatClassification', 'riskScore', 'severity', 'blastRadius', 'confidence',
      'impactSummary', 'recommendations', 'assets', 'edges',
    ],
  };

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: controller.signal,
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
          json_schema: { name: 'fumblebee_analysis', strict: true, schema: requestSchema },
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
    clearTimeout(timeout);
    return { analysis: parsed.data, source: 'nemotron' };
  } catch (error) {
    clearTimeout(timeout);
    const reason = error instanceof Error && error.name === 'AbortError'
      ? 'request timed out'
      : error instanceof Error
        ? error.message
        : String(error);
    console.warn(`[Nemotron] Falling back to structured mock data (${reason})`);
    return { analysis: mockNemotron(input), source: 'mock' };
  }
}

export async function generateContainmentScript(
  asset: ContainmentAsset,
  options: NemotronOptions = {},
): Promise<ContainmentScript> {
  const apiKey = options.apiKey ?? process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.warn('[Nemotron] Falling back to structured mock data (NVIDIA_API_KEY is not set)');
    return mockContainmentScript(asset);
  }

  const endpoint = options.endpoint ?? process.env.NVIDIA_API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions';
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  const requestSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      command: { type: 'string', minLength: 1 },
      description: { type: 'string', minLength: 1 },
      executionEnvironment: { type: 'string', enum: ['aws-cli', 'bash', 'powershell'] },
    },
    required: ['command', 'description', 'executionEnvironment'],
  };

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model ?? process.env.NVIDIA_NEMOTRON_MODEL ?? 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        messages: [
          {
            role: 'system',
            content: 'You are an air-gapped tactical SecOps agent. Given a compromised cloud/network asset, output ONLY executable CLI containment commands (e.g., AWS CLI, Linux iptables, or PowerShell) and a 1-sentence tactical rationale. Do not output chat filler.',
          },
          {
            role: 'user',
            content: JSON.stringify(asset),
          },
        ],
        temperature: 0.1,
        max_tokens: 512,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'fumblebee_containment', strict: true, schema: requestSchema },
        },
      }),
    });
    if (!response.ok) throw new Error(`Nemotron API returned ${response.status}`);
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Nemotron API returned no content');
    const parsed = ContainmentScriptSchema.safeParse(JSON.parse(content));
    if (!parsed.success) throw new Error(`Nemotron returned invalid containment script: ${parsed.error.message}`);
    clearTimeout(timeout);
    return parsed.data;
  } catch (error) {
    clearTimeout(timeout);
    const reason = error instanceof Error && error.name === 'AbortError'
      ? 'request timed out'
      : error instanceof Error
        ? error.message
        : String(error);
    console.warn(`[Nemotron] Falling back to structured mock data (${reason})`);
    return mockContainmentScript(asset);
  }
}
