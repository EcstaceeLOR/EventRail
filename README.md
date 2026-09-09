# EventRail

EventRail is the non-custodial integration and trading layer for DreamDEX Event Contracts on Somnia. It combines a consumer trading experience with safe transaction planning, automatic market rollover, portfolio and claim tooling, a public API, and a React SDK.

## Workspace

| Path | Purpose |
| --- | --- |
| `apps/web` | Consumer-facing, multi-page EventRail application |
| `apps/gateway` | Public API and transaction-planning gateway |
| `apps/developer-portal` | API keys, documentation, usage, and integration management |
| `apps/examples` | Runnable SDK and embed examples |
| `packages/*` | Core domain, API client, React SDK, DreamDEX adapter, data, and shared types |
| `workers/*` | Market synchronization, receipt reconciliation, and settlement detection |
| `openapi` | Versioned public API contract |

## Development

Requirements: Node.js 24+ and Corepack.

```bash
corepack enable
pnpm install
pnpm dev
```

The web application starts on `http://localhost:3000`; other apps declare their development ports in their package scripts.

Run every build and type check from the repository root:

```bash
pnpm build
pnpm typecheck
```

Copy `.env.example` to `.env.local` when network integration begins. Never commit wallet keys or service credentials.
