# EventRail operational runbooks

These procedures prefer read-only inspection and immutable rollback. Incident commander (IC) owns decisions; Data owns RPC/indexer incidents; Trading owns planning; Settlement owns scanner backlog; Platform owns API/webhooks; Communications owns status updates.

## Universal first response

1. Assign an IC, severity, start time, and correlation IDs. Announce investigation on `/status`.
2. Inspect `/v1/health` and `/metrics`; compare RPC lag, cache age, stream state, plan failures, confirmation latency, and settlement backlog.
3. If integrity is uncertain, set the deployment's `TRANSACTION_PLANNING_ENABLED=false` kill switch and redeploy. Reads may remain available with visible stale/degraded labels.
4. Preserve logs and hashes. Never paste tokens, signatures, private configuration, or user signing data into the incident channel.
5. Recover only after two healthy observation windows, a read-only DreamDEX check, and a synthetic plan that is simulated but never signed.

## Stale data or stream disconnect

- **Detect:** `cache_age_seconds > 15`, `stream_connected = 0`, stale UI banner, or SSE reconnect spike.
- **Mitigate:** disable planning; keep stale reads explicitly labeled; restart one consumer at a time using its durable cursor.
- **Recover:** compare canonical blocks across RPCs, replay from the last committed cursor, confirm duplicate events converge, then re-enable planning.
- **Verify:** market generation, book, and status share an authoritative source block; alert clears; browser recovery journey passes.

## RPC failure, deception, or reorg

- **Detect:** lag over five blocks, chain-ID/bytecode mismatch, conflicting canonical hashes, or open circuit.
- **Mitigate:** disable planning; remove the suspect endpoint through configuration; do not manually force a block checkpoint.
- **Recover:** validate chain ID and registry bytecode against two independent endpoints; wait for finality; restart reads before writes.
- **Verify:** scheduled compatibility smoke and resilience suite pass; record affected plan hashes and communicate that pending wallet transactions may still execute.

## Bad release

- **Detect:** error-budget burn, health degradation, E2E regression, migration error, or unexpected calldata diff.
- **Mitigate:** stop rollout and disable planning if signing safety is affected.
- **Rollback:** redeploy the previous immutable application artifact. Database migrations are backward-compatible for one release; use `pnpm db:rollback` only for the single reviewed latest migration and only after a backup and target-version check. Never recursively delete a deployment or database directory.
- **Verify:** health, migrations, primary journeys, and one read-only Shannon market pass before closing the incident.

## Settlement backlog

- **Detect:** `settlement_backlog > 100`, checkpoint age, or claims remain pending past the service objective.
- **Mitigate:** keep trading independent; scale scanner workers only after confirming partitions/checkpoints do not overlap.
- **Recover:** replay the last incomplete page. Checkpoints advance only after the complete page commits, so duplicates must converge.
- **Verify:** compare ERC-6909 balances and payout vectors for a sample of resolved and voided markets; backlog returns below threshold.

## Tabletop record

Initial exercise: 9 September 2026, performed through the named deterministic failure fixtures. Result: expected kill-switch, alert, rollback, replay, and ownership paths were confirmed; no destructive recovery command is required.

| Scenario           | Exercise                                                       | Expected evidence                                        |
| ------------------ | -------------------------------------------------------------- | -------------------------------------------------------- |
| Stale stream       | Set `stream_connected` to 0 in the synthetic monitor test      | Critical alert, degraded health, planning disabled by IC |
| RPC reorg          | Run conflicting-hash resilience fixture                        | Write guard closes and no plan is produced               |
| Bad release        | Reapply latest migration after rollback in isolated PostgreSQL | Schema and idempotent records converge                   |
| Settlement backlog | Set backlog to 101 in synthetic monitor test                   | Warning fires and scanner ownership is clear             |

Exercise this table before each production milestone and record date, participants, gaps, and follow-ups in the release issue.
