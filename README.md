# SentinelGraph AI

SentinelGraph AI is an insider threat investigation interface for security teams. It provides an investigation dashboard, an AI-assisted case workspace, a read-only attack-path graph, collaborative notes, an activity timeline, and a tamper-evident audit view.

The repository contains both the Next.js frontend and the SpacetimeDB backend integration:

- `src/`: Next.js App Router frontend
- `server/`: SpacetimeDB schema, RBAC reducers, and audit logging
- `services/`: Nemotron AI pipeline and SpacetimeDB commit helper
- `sdk/`: Typed frontend adapters and React Flow graph transformers
- `scripts/`: Local integration verification scripts

## Run locally

```bash
npm install
npm run dev
```

The application is built with Next.js App Router, TypeScript, Tailwind CSS, React Flow, dagre, and lucide-react.
The development UI can use typed mock data while the generated SpacetimeDB transport is connected through the SDK.

## Routes

- `/` — investigation dashboard and new-investigation dialog
- `/investigations/[id]` — investigation summary, attack path, AI findings, notes, activity, and audit drawer

## Build

```bash
npm install
npm run build
```

`npm run build` validates both the Next.js frontend and all backend TypeScript workspaces:

- `npm run build:frontend`
- `npm run build:backend`

## Nemotron

If `NVIDIA_API_KEY` is not set, `services/nemotron.ts` automatically uses its deterministic mock analysis. The API-key-enabled path uses an NVIDIA OpenAI-compatible chat-completions endpoint and requires a strict JSON-schema response.

```bash
export NVIDIA_API_KEY="..."
export NVIDIA_NEMOTRON_MODEL="nvidia/llama-3.1-nemotron-ultra-253b-v1"
```

On PowerShell, use `$env:NVIDIA_API_KEY = "..."` and `$env:NVIDIA_NEMOTRON_MODEL = "..."`.

The AI response contract includes `threatClassification`, title-cased severity, scores, `impactSummary`, recommendations, assets, and graph edges. Run the local contract verification with:

```bash
npx tsx scripts/test-pipeline.ts
```

## Publish the SpacetimeDB module

```bash
spacetime publish --server local --module-path ./server --yes sentinelgraph
```

After installation, the SpacetimeDB CLI may need to be reloaded through your terminal PATH. The `applyAiAnalysis` reducer accepts JSON-string payloads for `recommendations`, `assets`, and `relationships`, matching the SpacetimeDB v2 TypeScript constraints.

Generated SpacetimeDB bindings should be registered in the Next.js transport passed to `createSentinelGraphClient`. The SDK exposes React Flow nodes under `data.asset` and supports both serialized backend graph data and frontend edge property variants.
