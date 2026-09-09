# Local development stack

EventRail uses PostgreSQL 18 for durable indexed state and Redis 8 for transient cache, rate-limit, and stream coordination state. Both images are pinned by digest in `compose.yaml` so every contributor and CI runs the same services.

## Prerequisites

- Node.js 24 or newer
- pnpm 10.34.5 through Corepack
- Docker Desktop with Docker Compose v2

Copy `.env.example` to `.env.local` for the web application and export `DATABASE_URL` and `REDIS_URL` in the terminal that runs backend commands. Never commit either environment file.

## Start and stop

```bash
pnpm infra:up
pnpm infra:status
pnpm infra:down
```

`infra:up` waits for both health checks, applies all pending migrations, and inserts deterministic development seed data. PostgreSQL is available on port `5432` and Redis on `6379`. Override a host port with `POSTGRES_PORT` or `REDIS_PORT` before starting Compose.

Data persists in the named `eventrail_postgres_data` and `eventrail_redis_data` volumes. To remove only those EventRail volumes and rebuild a clean local stack:

```bash
pnpm infra:reset
```

## Database commands

```bash
pnpm db:migrate
pnpm db:rollback
pnpm db:seed
```

The migration runner records a SHA-256 checksum and refuses to run if an already-applied migration has changed. Add a new numbered migration instead of editing an applied file. Seeding refuses non-local hosts and any database not named `eventrail`.

## Troubleshooting

- `Docker is required`: install or start Docker Desktop, then verify `docker compose version`.
- Port already allocated: stop the conflicting service or set `POSTGRES_PORT` / `REDIS_PORT` to unused ports and update the corresponding URL.
- PostgreSQL unhealthy: run `docker compose --project-name eventrail logs postgres` and check free disk space and volume permissions.
- Authentication failed: use the credentials in `.env.example`; after changing Compose credentials, run `pnpm infra:reset` because PostgreSQL only applies bootstrap credentials to a new volume.
- Migration checksum error: restore the applied migration and create a new forward migration.

Docker is not bundled with the repository. Migration integration tests run automatically in GitHub Actions even when a contributor's machine has no Docker daemon.
