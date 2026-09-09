# EventRail product brief

Status: Accepted for M0  
Owners: Product and engineering  
Related issues: #1, #9

## Product statement

EventRail is a non-custodial product and integration layer for DreamDEX Event Contracts on Somnia. It gives traders a coherent journey from discovery through settlement and gives builders a stable API, React SDK, and safe transaction plans without hiding the underlying market or taking custody of user funds.

The missing piece is not another prediction-market interface. It is the reusable railway between DreamDEX's protocol surface and every consumer, community, agent, or wallet experience that wants to embed event markets.

## Problem

DreamDEX exposes capable on-chain markets, but an integrating team must still solve the same product problems repeatedly:

- normalize market discovery, identifiers, prices, phases, and rollover;
- reconcile fast indexer data with canonical on-chain state before a write;
- turn protocol calls into inspectable wallet transactions;
- follow submitted transactions through fills, positions, settlement, and claims;
- design loading, empty, stale, disconnected, failed, and recovery states;
- maintain realtime connections and backfill gaps;
- explain resolution evidence to users; and
- measure adoption without collecting unnecessary wallet identity data.

That repeated work slows adoption and produces inconsistent safety guarantees. EventRail centralizes the read and planning complexity while keeping signing in the user's wallet.

## Personas and jobs

### Host-app developer

Builds a wallet, media, sports, community, gaming, or consumer application and wants event markets to feel native to that product.

- Job: add market discovery, trading, positions, and claims in days rather than weeks.
- Pain: protocol-specific lifecycle logic, realtime recovery, and transaction construction dominate the integration.
- Success: a themed embed or headless integration reaches a verified wallet prompt with minimal custom chain code.

### End trader

Discovers an event through EventRail or a host application and wants to express a view without learning contract internals.

- Job: understand the outcome, price, liquidity, deadline, and resolution conditions before committing funds.
- Pain: stale quotes, ambiguous wallet prompts, fragmented position tracking, and unclear claims.
- Success: the user can inspect the exact action, sign once, see the fill, and later verify and claim the outcome.

### Agent builder

Builds an automated research, alerting, execution, or portfolio agent.

- Job: consume normalized market state, react to changes, and request deterministic transaction plans.
- Pain: unstable identifiers, float-based financial math, incomplete fills, and unsafe unattended writes.
- Success: the agent uses versioned schemas, idempotency, freshness bounds, and explicit execution assumptions.

## MVP capability map

| MVP capability                                    | Primary persona                   | Problem resolved                                                  | Evidence of success                                                                                                |
| ------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Normalized market catalogue and detail API        | Host-app developer, agent builder | Every integration interprets protocol records differently         | A market is represented by the same `marketId`, phase, outcomes, and freshness metadata in REST, streams, and SDKs |
| Realtime price, book, trade, and lifecycle stream | All                               | Polling is slow and dropped connections create silent gaps        | A reconnect backfills from the last acknowledged block before returning to live state                              |
| Quote and non-custodial transaction planner       | End trader, host-app developer    | Wallet prompts expose calldata rather than intent                 | Every plan states inputs, bounds, contract, source block, expiry, assumptions, and human-readable effects          |
| Client-side simulation and signing                | End trader                        | A server-side signer would introduce custody and hidden authority | EventRail never receives a private key; the connected wallet simulates and signs                                   |
| Receipt and fill reconciliation                   | End trader, agent builder         | A transaction hash alone does not prove execution                 | Submitted plans resolve to confirmed, partially filled, filled, cancelled, expired, or reverted states             |
| Stable rollover model keyed by `marketId`         | All                               | Recycled pools and new windows can corrupt app state              | Historical positions remain tied to their original market while discovery moves to the successor                   |
| Portfolio, settlement proof, and claim planning   | End trader                        | Positions disappear into contract-specific claim flows            | A resolved position shows oracle evidence and an inspectable redemption plan                                       |
| TypeScript API client and headless React SDK      | Host-app developer                | Teams rebuild fetching, state, and error handling                 | A reference host app integrates discovery-to-wallet using the published packages                                   |
| USDso funding route discovery                     | End trader, host-app developer    | Users may lack the required quote asset                           | EventRail presents an explicit DreamDEX spot funding route without custodying or auto-swapping funds               |

## Trust model

EventRail is non-custodial by construction:

- EventRail services may read public chain/indexer data, normalize it, cache it, and prepare unsigned transaction plans.
- Only the user's wallet or explicitly configured agent account signs a network write.
- The browser independently checks chain ID, destination, calldata summary, spend, minimum receive, deadline, and source freshness before requesting a signature.
- Plans are short-lived and hash-bound. The gateway cannot silently change a plan after the client displays it.
- API and cache data are advisory. Canonical write eligibility, balances, allowance, market status, and settlement are rechecked on-chain.
- EventRail does not accept seed phrases, private keys, exchange credentials, or recoverable wallet secrets.
- Analytics use pseudonymous installation/session identifiers by default; full wallet addresses are only processed when required for a user-requested portfolio action.

## Scope

### MVP

- Shannon and mainnet network registries with DreamDEX contracts and indexers.
- Event-market discovery, detail, order book, trades, and lifecycle state.
- Safe quote and trade-plan generation for YES/NO outcomes.
- Wallet connection, simulation, execution, and receipt/fill tracking.
- Position discovery, portfolio valuation, resolution evidence, and redemption planning.
- Automatic rollover presentation keyed by stable market identity.
- Public REST/stream API, TypeScript client, headless React hooks, and one embed example.
- Responsive multi-page consumer application and developer portal.
- Reliability telemetry, rate limits, origin controls, and operational runbooks.

### Post-MVP

- Hosted embeddable components and tenant themes.
- Signed webhooks, builder attribution, and usage dashboard.
- Funding orchestration across supported DreamDEX spot routes.
- Agent policies, delegated/session signing, and budget controls.
- Additional outcome structures if DreamDEX supports them.
- Historical analytics, market-quality scoring, and host conversion experiments.

## Explicit non-goals

- Operating a new exchange, market maker, oracle, resolver, bridge, or order book.
- Custodying funds, holding user keys, signing for ordinary wallet users, or guaranteeing execution.
- Inventing market outcomes or overriding DreamDEX settlement.
- Promising profit, ranking users by expected returns, or giving personalized financial advice.
- Hiding contract addresses, resolution sources, price impact, plan expiry, or transaction failure.
- Using pool addresses as permanent market identity.
- Replacing the DreamDEX SDK; EventRail composes it into a stable product contract.
- Supporting every EVM network or prediction protocol in the MVP.

## Adoption thesis

EventRail creates a two-sided adoption loop:

1. A host integrates a complete market journey with less protocol-specific code.
2. The host distributes event markets in an existing community context.
3. Traders receive a consistent safety, portfolio, and claim experience across hosts.
4. More activity improves market visibility and gives builders evidence that integration converts.
5. Better SDK, examples, analytics, and attribution attract the next host.

The wedge is the safe, inspectable transaction plan plus lifecycle continuity. Market lists are easy to copy; reliable discovery-to-claim infrastructure is not.

## Product principles

1. Show intent before calldata.
2. Recheck canonical state before every write.
3. Treat stale data as a visible state, never as success.
4. Key product state by stable market identity, not a recycled contract address.
5. Make every failure recoverable or explicitly final.
6. Keep the protocol visible and the signer outside EventRail.
7. Build one contract for first-party UI, embeds, SDK users, and agents.
