# API, event, and transaction-plan contract v1

Status: Accepted  
Contract source: [`openapi/eventrail.v1.yaml`](../../openapi/eventrail.v1.yaml) and [`packages/types/src/v1.ts`](../../packages/types/src/v1.ts)

## Compatibility boundary

`/v1` is the public HTTP compatibility boundary and every stream envelope and transaction plan carries `version: "1"`. Within v1, EventRail may add optional response fields and new error codes or event types. It will not remove or rename fields, change field meaning, make optional inputs required, or reuse an enum value with a different meaning. A breaking change requires `/v2`, a migration guide, and a measured deprecation window.

The TypeScript package supplies runtime Zod schemas as well as inferred types. Consumers should ignore unknown response fields but handle unknown enum discriminators defensively.

## Reads, freshness, and pagination

Market reads expose both `observedAt` and the authoritative Somnia `sourceBlock`. `indexedBlock` identifies the DreamDEX indexer position when applicable. `staleAfter` is the time after which a client must label the value stale or refetch; it is not a promise that the underlying market cannot change sooner.

List endpoints use opaque cursor pagination. A cursor encodes server ordering state and must never be parsed, edited, or reused with different filters. An absent cursor starts a traversal; `page.hasNextPage: false` completes it.

## Errors

All non-success JSON responses use `ApiErrorEnvelope`. `code` is stable for programmatic handling, `message` is safe for display, `requestId` joins logs to a response, and `recoverable` tells the client whether retry or refreshed user intent may succeed. Internal stack traces and upstream credentials never cross this boundary.

`STALE_MARKET_STATE` means the quote or source block no longer satisfies plan assumptions. `PLAN_EXPIRED` means the wallet must request a new plan instead of submitting the old calls.

## Idempotency

Every plan-creation request requires `Idempotency-Key`. The gateway stores the key, authenticated caller, canonical request hash, response, and expiry. Repeating the same key and body returns the original plan; repeating the key with a different body returns `409 CONFLICT`. Keys expire after 24 hours. Planning remains non-custodial and never submits a transaction.

## Transaction plan integrity

A plan binds these values before wallet review:

- the account and Somnia network;
- ordered contract calls, values, and calldata;
- the source block and observation time used for the quote;
- explicit assumptions, expected effects, and expiry.

`planHash` is `keccak256` of RFC 8785 canonical JSON for the plan with `planHash` omitted. The gateway persists the hash for reconciliation. The browser recomputes it and rejects a mismatch. The wallet remains the signer and shows the call for approval; EventRail services hold no user private keys and cannot execute a plan.

## Streams and replay

Market streams use server-sent events because updates are one-way and resumable over standard HTTP. The SSE `id` equals the envelope `eventId`. Clients reconnect with `Last-Event-ID`; the gateway replays retained events in sequence and emits a fresh market snapshot if the retention window has elapsed. Consumers deduplicate by `(network, eventId)` and reject a decreasing sequence for the same market.

The durable event record contains `sourceBlock`, while Redis is only fan-out and replay acceleration. On-chain state wins whenever cached, indexed, and chain observations disagree.
