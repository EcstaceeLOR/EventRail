# DreamDEX Shannon integration spike

Status: Read path verified; signer-dependent write evidence pending  
SDK: `@somnia-chain/markets-sdk@0.29.0`  
Network: Somnia Shannon (`50312`)

## Reproduce

Install the workspace and run the read-only spike. It discovers a currently trading binary market with YES liquidity, then reads its indexed description, on-chain four-sided book, contract lifecycle, and current block.

```bash
pnpm install
pnpm --filter @eventrail/dreamdex-adapter spike:shannon
```

The command requires no wallet and sends no transaction. To submit the smallest pool-valid YES IOC, use a disposable Shannon account funded with STT for gas. Copy `.env.example` to the ignored root `.env.local`, set the key and write flag there, then rerun the command. The script mints test collateral through DreamDEX's TestUSDC faucet when the account is short.

```dotenv
DREAMDEX_PRIVATE_KEY=0x...
DREAMDEX_LIVE_WRITE=1
```

After the account has a finalized winning position, inspect claimable entries and execute their batch redemption:

```bash
DREAMDEX_PRIVATE_KEY=0x... DREAMDEX_REDEEM=1 pnpm --filter @eventrail/dreamdex-adapter spike:shannon
```

Never use a mainnet key. The script validates but does not print the private key. Writes are disabled unless the corresponding flag is exactly `1`.

## Verified read evidence

At `2026-09-09T01:19:48.855Z`, the script read Somnia block `483435848` and selected market `0x00000000000000000000000000000000000000000000000000000000000178cd`:

- question: “BTC closes at or above its opening price”;
- pool: `0x5df3d8fca5506427bb585f427230329ce30a2dd3`;
- indexed lifecycle: `Trading`; on-chain status: `1` (`Trading`);
- on-chain backing: `1500000000` at six collateral decimals;
- best YES ask: `20000` for `200000000` outcome units;
- settlement state: not finalized, unresolved, and not voided.

The evidence is intentionally concise and contains no account, key, or authenticated endpoint. A later run may select a different rolling market; stable assertions are the chain, contract surface, lifecycle agreement, and non-empty executable book side.

## Write and redemption protocol

The spike reads the pool’s `tickSize`, `lotSize`, and `minQuantity` immediately before a write. It submits `BUY_YES` at the current best ask using `ORDER_TYPE.MARKET` (`ImmediateOrCancel`) and `autoApprove: true`. The SDK waits for the receipt; the output records its transaction hash, receipt status, and decoded fills. A zero-fill receipt does not meet the issue’s fill criterion and must not be reported as success.

For redemption, `client.getClaimable(account)` prepares exact `(marketId, outcomeIdx, amount)` entries from finalized positions. `trader.redeemMany` executes those entries and records its confirmed receipt. The command never guesses a winning side from a pre-resolution default.

## SDK gaps and gotchas

- The public package’s README mentions a low-level `createClient`, but release `0.29.0` intentionally exports only `SomniaMarkets`; the raw client is available at `exchange.client`.
- Binary identity is the bytes32 `marketId`, not the recyclable pool address. Use the pool only for the currently bound order book.
- Lifecycle events alone do not express every time-driven transition. Compare indexed timestamps with the chain read before enabling a trade.
- Money and prices are raw integers at each market’s collateral decimals. Conversion happens only at EventRail’s boundary.
- `getBinaryOrderBook` is the chain-current checksum. Indexed history may lag a receipt, so receipt logs and on-chain order state reconcile writes first.
- An IOC is not proof of a fill. The decoded `fills` array must be non-empty.
- Redemption must use `getClaimable`; `winningOutcome` is not meaningful before `isResolved` is true.

## Remaining acceptance evidence

The workspace does not contain a funded Shannon signer, so no transaction was fabricated or submitted during this run. To finish issue #14, attach a real IOC transaction hash with at least one decoded fill, then—after that position settles—attach the confirmed redemption transaction hash. Both hashes should link to the Shannon explorer and be copied into this document without committing the key.
