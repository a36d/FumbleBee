# FumbleBee
alawn - HackUTD Team Submission

# SentinelGraph AI backend

## Packages

- `server/`: SpacetimeDB schema and reducers
- `services/`: Nemotron analysis and SpacetimeDB commit helpers
- `sdk/`: Exportable TypeScript client for Next.js

## Build

```bash
npm install
npm run build
```

## Nemotron

If `NVIDIA_API_KEY` is not set, `services/nemotron.ts` automatically uses its deterministic mock analysis. The API-key-enabled path uses an NVIDIA OpenAI-compatible chat-completions endpoint and requires a strict JSON-schema response.

```bash
export NVIDIA_API_KEY="..."
export NVIDIA_NEMOTRON_MODEL="nvidia/llama-3.1-nemotron-ultra-253b-v1"
```

## Publish the SpacetimeDB module

```bash
cd server
spacetime publish --server local sentinelgraph
```

The generated SpacetimeDB bindings should be registered in the Next.js transport passed to `createSentinelGraphClient`.
