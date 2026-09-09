import assert from "node:assert/strict";
import test from "node:test";
import { binaryPoolWriteAbi, erc20WriteAbi } from "@somnia-chain/markets-sdk";
import { decodeFunctionData } from "viem";
import {
  computeTradePlanHash,
  InMemoryTradePlanStore,
  PlanConflictError,
  TradePlanner,
} from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const poolAddress = `0x${"11".repeat(20)}`;
const collateralAddress = `0x${"22".repeat(20)}`;
const outcomeTokenAddress = `0x${"33".repeat(20)}`;
const account = `0x${"44".repeat(20)}`;
const quote = {
  version: "1",
  network: "shannon",
  venue: "dreamdex",
  marketId,
  poolAddress,
  collateralDecimals: 6,
  outcome: "up",
  side: "buy",
  mode: "quantity",
  requestedAmount: "1500000",
  quantity: "1500000",
  availableQuantity: "10000000",
  minimumFillQuantity: "1500000",
  notional: "925000",
  fee: "2313",
  total: "927313",
  maximumCost: "1082700",
  minimumReceive: "0",
  averagePrice: "616667",
  worstPrice: "650000",
  limitPrice: "720000",
  priceImpactBps: "277",
  spread: "10000",
  tickSize: "1000",
  lotSize: "100000",
  sourceBlock: "987",
  observedAt: "2026-09-09T10:00:00.000Z",
  expiresAt: "2026-09-09T10:00:08.000Z",
  marketExpiresAt: "2026-09-09T10:05:00.000Z",
  warnings: [],
};
const policy = {
  maxSlippageBps: 2000,
  minimumFillBps: 10000,
  minimumTimeRemainingSeconds: 30,
  quoteSourceBlock: "987",
  quoteExpiresAt: "2026-09-09T10:00:08.000Z",
};
const baseInput = {
  idempotencyKey: "intent-0001",
  chainId: 50312,
  account,
  collateralAddress,
  outcomeTokenAddress,
  upTokenId: "1",
  downTokenId: "2",
  quote,
  policy,
};

function planner(store = new InMemoryTradePlanStore()) {
  return new TradePlanner({
    store,
    clock: () => new Date("2026-09-09T10:00:01.000Z"),
    planId: () => "018f0f9f-7b42-7cc1-8000-000000000001",
  });
}

test("builds exact approval and DreamDEX IOC calldata without a signer", async () => {
  const plan = await planner().create(baseInput);
  assert.equal(plan.calls.length, 2);
  const approval = decodeFunctionData({ abi: erc20WriteAbi, data: plan.calls[0].data });
  assert.equal(approval.functionName, "approve");
  assert.deepEqual(approval.args, [poolAddress, 1082700n]);
  const order = decodeFunctionData({ abi: binaryPoolWriteAbi, data: plan.calls[1].data });
  assert.equal(order.functionName, "placeBinaryOrder");
  assert.equal(order.args[0], 0, "BUY_YES order kind");
  assert.equal(order.args[1], 720000n);
  assert.equal(order.args[2], 1500000n);
  assert.equal(order.args[4], 2, "DreamDEX immediate-or-cancel order type");
  const hashable = Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== "planId" && key !== "planHash"),
  );
  assert.equal(plan.planHash, computeTradePlanHash(hashable));
  assert.equal(JSON.stringify(plan).includes("privateKey"), false);
});

test("idempotency returns the original plan and rejects conflicting intents", async () => {
  const store = new InMemoryTradePlanStore();
  const subject = planner(store);
  const first = await subject.create(baseInput);
  const replay = await subject.create(baseInput);
  assert.deepEqual(replay, first);
  await assert.rejects(
    subject.create({ ...baseInput, quote: { ...quote, quantity: "1600000" } }),
    (error) => error instanceof PlanConflictError,
  );
});

test("shared canonical plan-hash vector remains stable", async () => {
  const plan = await planner().create(baseInput);
  assert.equal(plan.planHash, "0x1938b945328ea7bbe388280ddd700b01aa47bdcbb93ec4a91926cfdd89bc8358");
});
