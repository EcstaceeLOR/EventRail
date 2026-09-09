# Environment and network configuration

Configuration is parsed once at each process boundary by `@eventrail/config`. Invalid chain IDs, ports, URLs, database protocols, or Redis protocols fail startup with the field name in the error. Application code consumes the parsed object rather than reading arbitrary environment variables.

## Environments

| `APP_ENV`    | Somnia network              | Services                              | Intended use            |
| ------------ | --------------------------- | ------------------------------------- | ----------------------- |
| `local`      | Shannon (chain `50312`)     | Local PostgreSQL/Redis, local gateway | Daily development       |
| `test`       | Shannon or isolated mocks   | Ephemeral CI services                 | Automated tests         |
| `staging`    | Shannon (chain `50312`)     | Managed non-production services       | Deployment verification |
| `production` | Mainnet after launch review | Managed production services           | Public application      |

The web application is deliberately locked to Shannon during the hackathon. Enabling mainnet requires an explicit configuration-code change and review, rather than silently accepting a different chain ID.

## Browser-visible values

Only these variables may use the `NEXT_PUBLIC_` prefix and enter the browser bundle:

- `NEXT_PUBLIC_SOMNIA_CHAIN_ID`
- `NEXT_PUBLIC_SOMNIA_RPC_URL`
- `NEXT_PUBLIC_GATEWAY_URL`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (a public WalletConnect project identifier, not a signing secret)

## Server-only values

- `DATABASE_URL`
- `REDIS_URL`
- `SOMNIA_RPC_URL` and `SOMNIA_WS_URL`
- `DREAMDEX_INDEXER_URL`
- `DREAMDEX_PRIVATE_KEY`, used only by the opt-in Shannon spike and never by the web application

Server startup logging uses `describeServerEnvironment`, which returns hosts but strips usernames, passwords, and URL paths. Private keys are never passed to it.

## Wallet safety

The frontend supports EIP-1193/EIP-6963 injected wallets and WalletConnect. WalletConnect appears when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set. Account, chain, disconnection, balance, rejection, and provider errors are reactive Wagmi state. Every state-changing transaction remains in the connected wallet; EventRail never requests or stores a wallet private key.
