# EventRail security and privacy threat model

## Trust boundaries and guarantees

EventRail reads DreamDEX/indexer/RPC data, prepares bounded unsigned calls, and hands them to the user's wallet. It never has custody of funds and must never request, receive, store, or log a private key or seed phrase. Non-custodial does **not** mean risk-free: a user can still approve or sign a malicious, stale, incorrectly resolved, or economically unfavorable transaction. The wallet, Somnia, DreamDEX contracts, oracle inputs, RPC providers, host applications, and user device remain separate trust boundaries.

Public wallet addresses, transaction hashes, API-key prefixes, and product events may be operational data. Signing secrets, bearer tokens, webhook secrets, full authorization headers, and wallet signatures are prohibited telemetry.

## High-severity register

| Threat                                                     | Prevention                                                                                        | Detection/test evidence                                                                       | Owner        | Residual risk                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| Malicious host weakens embed safety or changes transaction | Config allowlist, immutable transaction plan/hash, wallet confirmation                            | `platform.test.mjs`, `verification.test.mjs`                                                  | Platform     | A hostile page can deceive outside the isolated widget; users must verify wallet details.     |
| Stale quote, market rollover, replay, wrong chain/account  | Short expiry, source block/generation binding, idempotency, preflight simulation                  | `trade-quote.test.mjs`, `rollover.test.mjs`, `verification.test.mjs`, browser wallet fixtures | Trading      | State can change after simulation and before inclusion.                                       |
| Compromised API/webhook key                                | Hash-at-rest, scoped environment/origin, quotas, revocation, derived rotating webhook secrets     | `platform.test.mjs`, `integrators.test.mjs`, `dispatcher.test.mjs`                            | Platform     | A valid server key can consume quota and access its own tenant until revoked.                 |
| RPC/indexer deception, outage, or reorg                    | Multi-endpoint quorum health, canonical block checks, circuit breaker, fail-closed write guard    | `resilience.test.mjs`, scheduled Shannon read                                                 | Data         | Multiple providers may share a correlated fault; on-chain confirmation remains authoritative. |
| Decimal, rounding, complement, depth error                 | Integer strings/BigInt, conservative rounding, schema bounds                                      | `financial-properties.test.mjs`, core quote and valuation tests                               | Trading      | Upstream contracts may introduce unsupported precision or semantics.                          |
| Incorrect settlement, void, or claim                       | Fresh ERC-6909 balance and payout-vector read, winner-only/void rules                             | `redemption.test.mjs`, `scanner.test.mjs`                                                     | Settlement   | Oracle or contract resolution itself can be disputed or incorrect.                            |
| XSS or sensitive-data leakage                              | React escaping, no HTML injection, CSP-ready app, recursive log redaction, repository secret scan | lint, E2E accessibility scan, `observability.test.mjs`, repository-policy meta-test           | Web/SRE      | Browser extensions and compromised dependencies remain outside the app boundary.              |
| SSRF through webhooks or RPC configuration                 | HTTPS-only webhook schema; production egress must resolve/allowlist destinations                  | gateway validation tests; deployment egress policy                                            | Platform/SRE | DNS rebinding requires infrastructure enforcement, not URL validation alone.                  |
| Dependency or workflow compromise                          | Frozen lockfile, pinned critical SDK, Dependabot, audit, CodeQL, least workflow permissions       | Security workflow and compatibility matrix                                                    | Maintainers  | A trusted upstream can publish malicious code before detection.                               |

## Privacy choices

- Collect only public-chain coordinates and the minimum tenant analytics needed for reliability and funnels.
- Analytics retention is tenant-configurable from 1–365 days and defaults to 90 days.
- Do not fingerprint wallets across integrators. Do not sell personal data.
- An integrator controls its own embed events and must disclose its independent collection.
- Incident exports and logs use correlation IDs and redacted attributes; they must not contain authorization material.

## Review protocol

Any change to calldata, ABI, authentication, telemetry fields, wallet state, market lifecycle, or retention requires a threat-model review. A high-severity item needs a named owner, a regression test, and a safe rollback before release. Security reports follow `SECURITY.md`.
