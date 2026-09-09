# Release quality gates

EventRail blocks a release on any failed lint, strict typecheck, unit/integration test, migration cycle, OpenAPI coverage check, critical dependency audit, CodeQL critical finding, ABI compatibility test, or primary browser journey.

## Budgets

| Boundary                                   | Budget                                                              |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Critical financial/lifecycle line coverage | At least 80% for `packages/core` and `packages/trading`             |
| Market navigation under CI/browser fixture | Under 15 seconds                                                    |
| Markets page transferred resources         | Under 3 MB browser transfer accounting                              |
| Critical accessibility violations          | Zero against WCAG 2 A/AA rules                                      |
| Browser matrix                             | Chromium, Firefox, and mobile Chromium with reduced motion          |
| RPC/indexer lag                            | Alert above 5 blocks; planning disabled when integrity is uncertain |
| Cache age                                  | Warning above 15 seconds; stale state is not usable for planning    |
| Settlement backlog                         | Warning above 100 markets                                           |

Tests use deterministic fixtures by default and never require the public network. The separate scheduled DreamDEX workflow is the only live-read suite and performs no signing or writes.

## Remediation expectations

- Critical security, signing-integrity, cross-tenant, secret, or dependency findings block release immediately.
- High findings need an owner and mitigation before release, or an explicitly time-bounded maintainer exception.
- Medium findings enter the next milestone with an owner. Low findings may be grouped.
- A flaky safety test is treated as a failure; it is fixed or removed with documented replacement evidence, never blindly retried into green.
