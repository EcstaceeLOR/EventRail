import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";
import { spotPoolWriteAbi } from "@somnia-chain/markets-sdk";
import { buildUsdsoFundingRoute } from "../dist/index.js";

const poolAddress = `0x${"11".repeat(20)}`;
const market = {
  poolAddress,
  baseToken: `0x${"22".repeat(20)}`,
  quoteToken: `0x${"33".repeat(20)}`,
  baseSymbol: "SOMI",
  quoteSymbol: "USDso",
  baseDecimals: 18,
  quoteDecimals: 6,
  baseIsNative: true,
  tickSize: "1000",
  lotSize: "1000000000000000",
  minQuantity: "1000000000000000",
};

test("builds an unsigned native-to-USDso IOC route from DreamDEX spot bids", () => {
  const route = buildUsdsoFundingRoute(
    "shannon",
    market,
    { bids: [{ price: 2_000_000n, quantity: 100n * 10n ** 18n }], asks: [] },
    { account: `0x${"44".repeat(20)}`, targetOutputQuantity: "25000000", maxSlippageBps: 100 },
    987n,
    new Date("2026-09-09T10:00:00.000Z"),
  );
  assert.ok(route);
  assert.equal(route.calls.length, 1);
  assert.equal(route.calls[0].kind, "funding");
  assert.equal(route.calls[0].value, route.inputQuantity);
  const decoded = decodeFunctionData({ abi: spotPoolWriteAbi, data: route.calls[0].data });
  assert.equal(decoded.functionName, "placeOrder");
  assert.equal(decoded.args[0], false, "sell native base for USDso");
  assert.equal(decoded.args[5], 2, "IOC order type");
});

test("returns no route when live spot depth cannot fund the target", () => {
  const route = buildUsdsoFundingRoute(
    "shannon",
    market,
    { bids: [{ price: 2_000_000n, quantity: 1n }], asks: [] },
    { account: `0x${"44".repeat(20)}`, targetOutputQuantity: "25000000", maxSlippageBps: 100 },
    987n,
    new Date("2026-09-09T10:00:00.000Z"),
  );
  assert.equal(route, null);
});
