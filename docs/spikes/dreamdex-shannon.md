# DreamDEX Shannon integration spike

Status: Complete; read, filled IOC, finalization, and redemption verified  
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

```dotenv
DREAMDEX_LIVE_WRITE=0
DREAMDEX_REDEEM=1
```

Then rerun `pnpm --filter @eventrail/dreamdex-adapter spike:shannon`.

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

## Confirmed write and redemption evidence

All transactions below were signed by a disposable Shannon-only account. No private key is stored in Git or included in this evidence.

### Filled IOC

At `2026-09-09T02:34:21.988Z`, the spike selected market `0x00000000000000000000000000000000000000000000000000000000000179b1` and read source block `483480571`.

- TestUSDC faucet: [`0xa37eebc65a1e17bc20a570d4b2bf72bdc4b1a2c190efaba315a43c97db83a0af`](https://shannon-explorer.somnia.network/tx/0xa37eebc65a1e17bc20a570d4b2bf72bdc4b1a2c190efaba315a43c97db83a0af)
- BUY YES IOC: [`0x56e955390848290f769c6b74823a102bf1ef266f90df1dfb6c6a7946a041d301`](https://shannon-explorer.somnia.network/tx/0x56e955390848290f769c6b74823a102bf1ef266f90df1dfb6c6a7946a041d301)
- Receipt: success, with one decoded fill of `1000` units at raw YES price `70000`.

That market resolved NO, correctly leaving the YES position non-claimable. To verify redemption deterministically, the test acquired the minimum quantity of both outcomes on the same subsequent five-minute market.

### Deterministic settlement position

Market `0x00000000000000000000000000000000000000000000000000000000000179c0` asked “ETH closes at or above its opening price.” Both transactions succeeded with a decoded `1000`-unit fill:

- BUY YES IOC: [`0xb414c937c62d125c47f74d89deb9bf58f84d32d90736ff4b2bc0ed63fdbef211`](https://shannon-explorer.somnia.network/tx/0xb414c937c62d125c47f74d89deb9bf58f84d32d90736ff4b2bc0ed63fdbef211), filled at raw YES price `620000`.
- BUY NO IOC: [`0xdbc16fba5dcde7c0bd9490f2a74ccca6f55c3f6f5e69fe00eb70bd2736d75d19`](https://shannon-explorer.somnia.network/tx/0xdbc16fba5dcde7c0bd9490f2a74ccca6f55c3f6f5e69fe00eb70bd2736d75d19), filled at raw YES price `591000`.

The chain finalized the market as a NO win (`winningOutcome: 1`). `getClaimable` prepared one entry for `outcomeIdx: 1`, amount `1000`.

### Redemption

- Batch redemption: [`0x75a212061f330885fa46ac1ade5fc3bd24f7d564a3503f18794a06f52daf5628`](https://shannon-explorer.somnia.network/tx/0x75a212061f330885fa46ac1ade5fc3bd24f7d564a3503f18794a06f52daf5628)
- Receipt: success at block `483484345`, gas used `504686`.
- Verification: a post-receipt `getClaimable` returned an empty list.

One intervening IOC was rejected with `ImmediateOrCancelNoFill` after its observed best quote moved. This validates the stale-state handling requirement: a no-fill is surfaced as a typed SDK revert and is never reported as a successful trade.
