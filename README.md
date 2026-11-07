# SentinelGraph AI

SentinelGraph AI is an insider threat investigation interface for security teams. It provides an investigation dashboard, an AI-assisted case workspace, a read-only attack-path graph, collaborative notes, an activity timeline, and a tamper-evident audit view.

## Run locally

```bash
npm install
npm run dev
```

The application is built with Next.js App Router, TypeScript, Tailwind CSS, React Flow, dagre, and lucide-react. The current UI uses typed mock data in `src/lib/mock-data.ts`; replace that adapter with the SpacetimeDB client when the backend integration is ready.

## Routes

- `/` — investigation dashboard and new-investigation dialog
- `/investigations/[id]` — investigation summary, attack path, AI findings, notes, activity, and audit drawer
