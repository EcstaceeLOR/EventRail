# Security policy

## Supported versions

Before the first stable release, only the latest commit on `main` receives security fixes. After versioned releases begin, the latest minor release is supported unless a release note states otherwise.

## Report a vulnerability

Do not open a public issue, discussion, or pull request for a suspected vulnerability. Use [GitHub’s private security advisory form](https://github.com/EcstaceeLOR/EventRail/security/advisories/new). Include affected revision, impact, reproduction steps, and a minimal proof of concept without real private keys or funds.

You should receive acknowledgement within three business days and an initial assessment within seven. We will coordinate validation, remediation, disclosure timing, and credit with you. Please allow a reasonable remediation window before public disclosure.

## Scope priorities

High-priority findings include transaction-plan tampering, signer or key exposure, stale-quote execution, authorization bypass, secret leakage, incorrect settlement or claim behavior, dependency compromise, and cross-user data access. EventRail is non-custodial: no service should request, store, transmit, or log a user’s private key or seed phrase.
