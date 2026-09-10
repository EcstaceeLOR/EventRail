# EventRail

EventRail is the non-custodial integration and trading layer for DreamDEX Event Contracts on Somnia. It combines a consumer trading experience with safe transaction planning, automatic market rollover, portfolio and claim tooling, a public API, and a React SDK.

**Live application:** [eventrail.vercel.app](https://eventrail.vercel.app)

The hosted frontend currently uses Somnia Shannon. Backend-dependent trading, portfolio, and analytics features become available when it is connected to a preview gateway.

For a no-billing hackathon preview, the repository also includes a Render Blueprint that deploys the gateway, workers, PostgreSQL, and Redis-compatible Key Value service. Free Render services are for demonstration only and can sleep or expire according to Render's free-tier limits.

## Workspace

| Path                    | Purpose                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `apps/web`              | Consumer-facing, multi-page EventRail application                            |
| `apps/gateway`          | Public API and transaction-planning gateway                                  |
| `apps/developer-portal` | API keys, documentation, usage, and integration management                   |
| `apps/examples`         | Runnable SDK and embed examples                                              |
| `packages/*`            | Core domain, API client, React SDK, DreamDEX adapter, data, and shared types |
| `workers/*`             | Market synchronization, receipt reconciliation, and settlement detection     |
| `openapi`               | Versioned public API contract                                                |
| `deploy` / `infra`      | Helm release topology and isolated GCP infrastructure                        |

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

Run the complete local quality gate before opening a pull request:

```bash
pnpm check
```

The check includes ESLint, strict TypeScript, unit tests, formatting, repository hygiene, secret-pattern scanning, and a meta-test that proves intentional lint, type, and test failures are rejected. Conventional commits and staged-file checks run automatically after `pnpm install` configures the Git hooks.

Copy `.env.example` to `.env.local` when network integration begins. Never commit wallet keys or service credentials.

## Project documentation

- [Product brief](docs/product/brief.md), [success metrics](docs/product/metrics.md), and [multi-page user flows](docs/product/sitemap-and-flows.md)
- [System-boundary ADR](docs/architecture/adr-0001-system-boundaries.md) and [v1 contract policy](docs/architecture/api-and-events-v1.md)
- [DreamDEX Shannon integration spike](docs/spikes/dreamdex-shannon.md)
- [Contributing](CONTRIBUTING.md), [security](SECURITY.md), and [support](SUPPORT.md)
- [Environment provisioning](docs/deployment/environments.md), [release and recovery](docs/deployment/release-and-recovery.md), and [launch checklist](docs/launch/checklist.md)
- [Demo runbook](docs/launch/demo.md) and [post-launch operating loop](docs/product/post-launch.md)

EventRail is licensed under the [MIT License](LICENSE).
