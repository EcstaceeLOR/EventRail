# EventRail metrics and service objectives

Status: Accepted for M0  
Owners: Product, platform, data, and reliability  
Related issues: #1, #10

## Measurement rules

- Metrics must be derivable from named events or service telemetry.
- Wallet identifiers are salted and pseudonymized for aggregate funnels unless the user requests an address-specific view.
- Test, internal, replayed, and bot traffic is tagged and excluded from adoption reporting.
- A funnel step counts once per `journeyId`; retries remain available as operational dimensions.
- Targets are initial MVP objectives and must be reviewed after the first 500 real journeys.

## Product funnels

| Metric                          | Formula                                                                            |                Initial target | Owner                | Source                    |
| ------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------: | -------------------- | ------------------------- |
| Market-detail conversion        | unique `market_viewed` journeys / unique `market_list_viewed` journeys             |                        >= 35% | Product              | Web/SDK analytics         |
| Quote-to-wallet conversion      | `wallet_prompted` / valid `trade_quote_presented`                                  |                        >= 55% | Product              | Client analytics          |
| Wallet-to-submission conversion | `transaction_submitted` / `wallet_prompted`                                        |                        >= 70% | Product              | Client analytics          |
| Submission-to-fill success      | journeys reaching filled or partially filled / `transaction_submitted`             | >= 95% on eligible IOC quotes | Trading              | Receipt reconciler        |
| Funding completion              | `funding_confirmed` / `funding_route_presented`                                    |                        >= 60% | Product              | Client and receipt events |
| Claim discovery                 | resolved positions shown in Claims / resolved claimable positions indexed          |                      >= 99.5% | Portfolio            | Settlement worker         |
| Claim completion                | `claim_confirmed` / `claim_plan_presented`                                         |                        >= 85% | Product              | Client and receipt events |
| Embed activation                | projects with a successful market API call / projects that create a production key |              >= 70% in 7 days | Developer experience | Gateway usage             |
| Embed trade conversion          | host-attributed `transaction_submitted` / host-attributed unique market viewers    | baseline, then +20% quarterly | Growth               | Builder attribution       |
| Time to first integration       | median time from `project_created` to `first_valid_api_call`                       |                  < 15 minutes | Developer experience | Developer portal/gateway  |

## Reliability and data objectives

| Objective                        | Measurement                                                               |                                                       Target | Owner     |
| -------------------------------- | ------------------------------------------------------------------------- | -----------------------------------------------------------: | --------- |
| Public read API availability     | successful non-5xx eligible requests / eligible requests, rolling 30 days |                                                        99.9% | Platform  |
| Transaction planner availability | successful valid plan requests / eligible plan requests, rolling 30 days  |                                                        99.9% | Trading   |
| Read latency                     | gateway request duration excluding client network                         |                                   p95 < 300 ms; p99 < 750 ms | Platform  |
| Plan latency                     | request to complete unsigned plan                                         |                                    p95 < 750 ms; p99 < 1.5 s | Trading   |
| Market freshness                 | indexed canonical head minus source block returned                        | p95 <= 2 blocks; no response beyond configured stale ceiling | Data      |
| Realtime propagation             | canonical event timestamp to EventRail stream emission                    |                                     p95 < 1 s after finality | Realtime  |
| Reconnect recovery               | stream reconnect to backfill completion                                   |                             p95 < 10 s for a 1,000-block gap | Realtime  |
| Receipt convergence              | submission to first confirmed/reverted state after chain inclusion        |                                                    p95 < 2 s | Trading   |
| Position reconciliation          | indexed quantity versus canonical ERC-6909 balance                        |                    >= 99.99% exact matches; mismatches alert | Portfolio |
| Wrong-chain prompts              | wallet prompts issued while connected chain differs from plan chain       |                                                            0 | Frontend  |
| Expired/stale plans signed       | submissions initiated after client-side expiry or freshness rejection     |                                                            0 | Frontend  |
| Secret exposure                  | private keys, seed phrases, or credentials accepted/logged                |                                                            0 | Security  |

## Error budgets and alerting

- Availability uses a 30-day error budget. Burn alerts fire at 2% budget consumption in one hour and 10% in six hours.
- Freshness has no silent error budget: responses crossing the stale ceiling return an explicit degraded error with last-known metadata.
- Planner correctness is prioritized over availability. A failed canonical preflight returns a recoverable error rather than a speculative plan.
- Position mismatches page the portfolio owner after three consecutive reconciliation runs and block automated claim suggestions for that position.
- Client-side wallet rejection is a user outcome, not a service error; malformed prompts and simulation failures are service/product errors.

## Analytics event catalogue

Every event includes `eventVersion`, `occurredAt`, `journeyId`, `surface`, `network`, optional `hostProjectId`, and privacy-safe session/install identifiers.

| Event                     | Required properties                                      |
| ------------------------- | -------------------------------------------------------- |
| `market_list_viewed`      | filters, resultCount, freshnessClass                     |
| `market_viewed`           | marketId, phase, category, sourceBlock                   |
| `trade_quote_requested`   | marketId, outcome, amountBucket                          |
| `trade_quote_presented`   | marketId, outcome, planId, quoteAgeMs, priceImpactBucket |
| `trade_quote_failed`      | marketId, errorCode, recoverable                         |
| `wallet_prompted`         | planId, walletFamily, chainMatched                       |
| `wallet_actioned`         | planId, action (`approved`, `rejected`, `failed`)        |
| `transaction_submitted`   | planId, transactionHash                                  |
| `transaction_reconciled`  | planId, status, fillCount, latencyMs                     |
| `funding_route_presented` | routeId, inputAsset, outputAsset                         |
| `funding_confirmed`       | routeId, transactionHash                                 |
| `portfolio_viewed`        | positionCount, stalePositionCount                        |
| `claim_plan_presented`    | marketId, planId, resolutionType                         |
| `claim_confirmed`         | marketId, planId, transactionHash                        |
| `stream_state_changed`    | state, retryCount, gapBlocks                             |
| `project_created`         | projectId, environment                                   |
| `api_key_created`         | projectId, scopes                                        |
| `first_valid_api_call`    | projectId, endpointGroup, sdkVersion                     |
| `embed_rendered`          | projectId, component, theme                              |

Amounts are bucketed in behavioral analytics. Exact financial values remain in operational transaction records only where needed for reconciliation.

## Hackathon demonstration success

The demonstration succeeds only if a reviewer can observe the following in one coherent journey:

1. Load real Shannon Event Contract data through the DreamDEX SDK or API.
2. Move between the landing, market list, market detail, portfolio, claims, and developer surfaces without editing a URL.
3. Show the same `marketId`, phase, price, and freshness metadata in the UI and API response.
4. Produce a human-readable, expiring transaction plan from a live market.
5. Simulate and submit a small Shannon transaction from a user-controlled wallet.
6. Reconcile its receipt and fill or explicit no-fill outcome.
7. Show rollover-safe identity and a finalized/voided claim path.
8. Integrate the same market into a reference host using `@eventrail/react`.
9. Disconnect realtime delivery, recover it, and visibly backfill without losing state.
10. Open operational telemetry showing latency, freshness, error, and funnel events for the journey.

The fallback recording must include transaction hashes and Shannon explorer links. Static mock data alone does not satisfy the demo target.
