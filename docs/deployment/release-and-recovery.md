# Release, rollback, and recovery

## Promotion

A release is a commit SHA, not a mutable environment build. Dispatch Deploy to preview, then staging. Review the smoke output and rendered image SHA before approving production. The workflow builds the image only when that SHA is absent, deploys with `maxUnavailable: 0`, waits for readiness, and runs the browser/API/DreamDEX smoke journey. GitHub's protected production environment supplies the approval gate.

Helm `--atomic` restores the last healthy revision if probes or smoke tests fail. For a manual rollback:

```bash
helm -n eventrail-production history eventrail-production
helm -n eventrail-production rollback eventrail-production <revision> --wait --timeout 10m
SMOKE_BASE_URL=https://app.example.com pnpm smoke:production
```

The planning kill switch is `config.transactionPlanningEnabled=false`. Apply it with an audited Helm upgrade when DreamDEX transaction construction or RPC consensus is suspect. Reads, portfolios, and status remain available while planning returns 503. Never use a rollback to reverse a non-backward-compatible migration; migrations must remain compatible with the prior application revision.

## Recovery objectives

- RPO: at most five minutes. Cloud SQL point-in-time recovery is enabled with seven production log-retention days and 30 retained backups.
- RTO: 60 minutes for database recovery and service validation. The monthly staging drill records the measured recovery time as a retained workflow artifact.
- Redis is rebuildable transport/cache state; PostgreSQL and on-chain Somnia/DreamDEX records are authoritative. A Redis loss triggers replay/re-indexing, not database restoration.

The Recovery drill uses a distinct target whose database name must end in `_restore_drill`; its safety guard rejects the source URL and unmarked targets. The drill dumps the source, restores into the isolated target, and verifies public-schema table parity. After each drill, record the workflow link, recovery duration, operator, data timestamp, and any remediation in the launch checklist. Restrict both drill credentials to their named databases and rotate them after suspected exposure.
