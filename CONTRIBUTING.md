# Contributing to EventRail

Thank you for improving EventRail. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development workflow

1. Choose or open a scoped GitHub issue. Security reports are the exception; follow [SECURITY.md](SECURITY.md).
2. Branch from current `main` using `type/issue-short-name`, for example `feat/42-market-stream`.
3. Install with `pnpm install`, make one cohesive change, and add tests for behavior.
4. Run `pnpm check` and `pnpm build` from the repository root.
5. Open a pull request linked to its issue and complete the template. At least one approving review and green required checks are needed before merge.

Do not commit `.env` files, wallet keys, access tokens, generated build output, or transaction evidence containing private account material.

## Commits and reviews

Commit subjects follow Conventional Commits: `type(scope): description`. Supported types are `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`, `revert`, and `security`. Keep commits reviewable and do not mix unrelated cleanup into a feature.

Reviewers check correctness, non-custodial boundaries, stale-state behavior, accessibility, observability, tests, and migration impact. Contract and signer-boundary changes require an architecture-owner review through `CODEOWNERS`.

## Branch and merge policy

`main` is protected and always releasable. Pull requests use squash merge, with the final subject retaining Conventional Commit form. Force-pushes to `main` and direct production changes are prohibited. Urgent fixes follow the same review and check path on a `fix/` branch.

## Versioning and releases

Public APIs and packages follow Semantic Versioning. Until `1.0.0`, a minor release may contain documented breaking changes; after `1.0.0`, breaking changes require a major release and migration guide. Internal applications deploy independently from package versions.

Releases are cut from `main` only after the complete gate passes. The release owner:

1. confirms migrations, rollback steps, and environment changes;
2. updates the changelog/release notes from merged pull requests;
3. creates an annotated `vX.Y.Z` tag and GitHub release;
4. deploys staging, runs smoke tests, then promotes the same artifact to production;
5. verifies health, error rate, freshness, and one read-only DreamDEX request before declaring success.

Rollback redeploys the previous immutable artifact. Database migrations must be backward-compatible across one release so code can roll back safely.
