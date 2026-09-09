import assert from "node:assert/strict";
import test from "node:test";
import {
  RegistryValidationError,
  getDreamDexRegistry,
  resolveMarketBinding,
  validateDreamDexRegistry,
} from "../dist/index.js";

const address = `0x${"11".repeat(20)}`;
const marketId = `0x${"ab".repeat(32)}`;

for (const network of ["shannon", "mainnet"]) {
  test(`${network} registry validates contracts and reads collateral decimals`, async () => {
    const registry = getDreamDexRegistry(network);
    const validated = await validateDreamDexRegistry(registry, {
      getChainId: async () => registry.chainId,
      getBytecode: async () => "0x6000",
      readCollateralDecimals: async () => 6,
    });
    assert.equal(validated.network, network);
    assert.equal(validated.collateralDecimals, 6);
  });
}

test("registry validation fails closed on the wrong chain or stale address", async () => {
  const registry = getDreamDexRegistry("shannon");
  await assert.rejects(
    validateDreamDexRegistry(registry, {
      getChainId: async () => 1,
      getBytecode: async () => "0x6000",
      readCollateralDecimals: async () => 6,
    }),
    (error) => error instanceof RegistryValidationError && error.code === "CHAIN_MISMATCH",
  );
  await assert.rejects(
    validateDreamDexRegistry(registry, {
      getChainId: async () => registry.chainId,
      getBytecode: async () => "0x",
      readCollateralDecimals: async () => 6,
    }),
    (error) => error instanceof RegistryValidationError && error.code === "NO_BYTECODE",
  );
});

test("market bindings are resolved afresh by marketId", async () => {
  let pool = address;
  const reader = {
    getBlockNumber: async () => 123n,
    getMarketOnchain: async () => ({
      marketAddress: address,
      outcomeToken: address,
      yesId: 1n,
      noId: 2n,
      pool,
      nonce: 7n,
      collateral: address,
      status: 1,
      backing: 100n,
      finalized: false,
      expiry: 2_000_000_000n,
      decimals: 6,
      winningOutcome: 0,
      isResolved: false,
      isVoided: false,
      voidPolicy: null,
    }),
  };
  const first = await resolveMarketBinding(marketId, reader);
  pool = `0x${"22".repeat(20)}`;
  const second = await resolveMarketBinding(marketId, reader);
  assert.notEqual(first.poolAddress, second.poolAddress);
});
