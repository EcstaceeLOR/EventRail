# Production launch checklist

This is the evidence record for the production go/no-go review. A checked item requires a linked workflow run, screenshot, transaction, or reviewer. Do not interpret repository implementation alone as proof of a live deployment.

## Required before go-live

- [ ] Three distinct GCP projects provisioned from reviewed Terraform plans.
- [ ] Production GitHub environment requires a reviewer; production secrets cannot be read by preview jobs.
- [ ] DNS resolves all five hosts and automated TLS renewal is healthy.
- [ ] Infrastructure workflow passes Terraform validation, three Helm renders, and secret-boundary tests.
- [ ] Staging deployment and full smoke journey pass using the exact production image SHA.
- [ ] Production deployment, readiness, security-header, CORS-denial, SSE, quote, unsigned plan, portfolio, and claim checks pass.
- [ ] Kill-switch rehearsal proves reads remain available while new planning is disabled.
- [ ] Rollback rehearsal restores the prior image and passes smoke tests.
- [ ] Recovery drill meets RPO/RTO and its artifact is retained.
- [ ] Status host, incident subscription feed, and investigating-to-resolved drill are public.
- [ ] Keyboard/a11y, broken-link, browser console, and source-map checks pass on public hosts.
- [ ] Demo run-through and fallback recording are available to the presenter.
- [ ] Security review has no open P0 findings; accepted risks have an owner and expiry.

## Current repository evidence

- `pnpm check`, `pnpm deploy:validate`, infrastructure CI, immutable container, non-root pod security, exact-origin CORS, CSP/security headers, readiness dependencies, graceful worker shutdown, atomic Helm deploys, smoke automation, and guarded recovery automation.
- External evidence is intentionally pending until real project IDs, domains, credentials, and GitHub environment approvals are supplied.

## Accepted-risk register

| Risk                                        | Control                                                                               | Owner             | Expiry                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------- | -------------------------- |
| Somnia Shannon or DreamDEX degradation      | Independent readiness/health, stale-data warnings, planning kill switch               | Application owner | Reassess at mainnet launch |
| Single cloud region                         | Cloud SQL regional HA plus retained recovery data; cross-region design is post-launch | Platform owner    | 30 days after launch       |
| GitHub Issues backs public incident history | Live health is independent; export incident timeline after every event                | Product owner     | 60 days after launch       |

Launch is blocked by any unchecked required item, missing owner, expired risk, secret in a browser bundle, failing migration, or unresolved P0 security defect.
