# DreamDEX compatibility matrix

EventRail pins `@somnia-chain/markets-sdk` 0.29.0 and treats its ABI as a signed-transaction boundary.

| Surface                         | Shannon                                  | Mainnet          | Evidence                                              |
| ------------------------------- | ---------------------------------------- | ---------------- | ----------------------------------------------------- |
| Registry addresses and bytecode | Scheduled read-only smoke                | Registry fixture | `registry.test.mjs`, scheduled compatibility workflow |
| ERC-20 approval                 | Encoded and decoded                      | Same pinned ABI  | `dreamdex-compatibility.test.mjs`                     |
| ERC-6909 operator approval      | Encoded and decoded                      | Same pinned ABI  | `dreamdex-compatibility.test.mjs`                     |
| Binary IOC order                | ABI signature and deterministic calldata | Same pinned ABI  | `plan.test.mjs`                                       |
| Stale generation rejection      | Fixture                                  | Fixture          | `verification.test.mjs`                               |
| Winning/void redemption         | ABI signature and fixtures               | Same pinned ABI  | `redemption.test.mjs`                                 |

The scheduled job is read-only and uses public Shannon endpoints. It never signs, approves, trades, or redeems. A signature, deployed-bytecode, chain-ID, market-binding, or live-read mismatch is a visible compatibility failure and blocks a release until reviewed.
