import assert from "node:assert/strict";
import test from "node:test";
import { orderBookEventsAbi } from "@somnia-chain/markets-sdk";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";
import { TradeReceiptReconciler } from "../dist/index.js";

const poolAddress = `0x${"11".repeat(20)}`;
const transactionHash = `0x${"aa".repeat(32)}`;
const plan = {
  version: "1",
  planId: "018f0f9f-7b42-7cc1-8000-000000000001",
  planHash: `0x${"bb".repeat(32)}`,
  network: "shannon",
  chainId: 50312,
  account: `0x${"44".repeat(20)}`,
  marketId: `0x${"cc".repeat(32)}`,
  poolAddress,
  collateralAddress: `0x${"22".repeat(20)}`,
  outcomeTokenAddress: `0x${"33".repeat(20)}`,
  outcome: "up",
  side: "buy",
  yesTermsPrice: "600000",
  quantity: "1500000",
  orderType: "ioc",
  orderExpiryNs: "1788948010000000000",
  quote: {
    version: "1",
    network: "shannon",
    venue: "dreamdex",
    marketId: `0x${"cc".repeat(32)}`,
    poolAddress,
    collateralDecimals: 6,
    outcome: "up",
    side: "buy",
    mode: "quantity",
    requestedAmount: "1500000",
    quantity: "1500000",
    availableQuantity: "1500000",
    minimumFillQuantity: "1500000",
    notional: "900000",
    fee: "0",
    total: "900000",
    maximumCost: "900000",
    minimumReceive: "0",
    averagePrice: "600000",
    worstPrice: "600000",
    limitPrice: "600000",
    priceImpactBps: "0",
    spread: "10000",
    tickSize: "1000",
    lotSize: "100000",
    sourceBlock: "987",
    observedAt: "2026-09-09T10:00:00.000Z",
    expiresAt: "2026-09-09T10:00:08.000Z",
    marketExpiresAt: "2026-09-09T10:05:00.000Z",
    warnings: [],
  },
  policy: {
    maxSlippageBps: 2000,
    minimumFillBps: 10000,
    minimumTimeRemainingSeconds: 30,
    quoteSourceBlock: "987",
    quoteExpiresAt: "2026-09-09T10:00:08.000Z",
  },
  calls: [
    {
      kind: "order",
      to: poolAddress,
      data: "0x00",
      value: "0",
      gas: "750000",
      description: "Submit IOC order",
      requiresConfirmation: true,
    },
  ],
  summary: "Buy UP",
  createdAt: "2026-09-09T10:00:01.000Z",
  expiresAt: "2026-09-09T10:00:08.000Z",
};

function fillLog(quantity, price, logIndex = 2) {
  return {
    address: poolAddress,
    topics: encodeEventTopics({
      abi: orderBookEventsAbi,
      eventName: "OrderFilled",
      args: { takerOrderId: 1n, makerOrderId: 2n },
    }),
    data: encodeAbiParameters(
      parseAbiParameters(
        "uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice",
      ),
      [quantity, 0n, 0n, price],
    ),
    logIndex,
  };
}

function harness(receipt) {
  const saved = [];
  const events = [];
  return {
    saved,
    events,
    reconciler: new TradeReceiptReconciler(
      { getReceipt: async () => receipt },
      { save: async (execution, fills) => saved.push({ execution, fills }) },
      { publish: async (event) => events.push(event) },
      () => new Date("2026-09-09T10:00:05.000Z"),
    ),
  };
}

test("reconciles a partial DreamDEX fill and publishes transaction and position updates", async () => {
  const subject = harness({
    status: "success",
    blockNumber: 999n,
    logs: [fillLog(500000n, 600000n)],
  });
  const execution = await subject.reconciler.reconcile({ plan, transactionHash });
  assert.equal(execution.state, "partially_filled");
  assert.equal(execution.filledQuantity, "500000");
  assert.equal(execution.realizedQuoteQuantity, "300000");
  assert.equal(execution.realizedAveragePrice, "600000");
  assert.equal(subject.saved[0].fills.length, 1);
  assert.deepEqual(
    subject.events.map((event) => event.type),
    ["transaction.updated", "position.updated"],
  );
});

test("persists reverted receipts without inventing fills", async () => {
  const subject = harness({ status: "reverted", blockNumber: 1000n, logs: [] });
  const execution = await subject.reconciler.reconcile({ plan, transactionHash });
  assert.equal(execution.state, "reverted");
  assert.equal(execution.errorCode, "TRANSACTION_REVERTED");
  assert.equal(subject.saved[0].fills.length, 0);
  assert.deepEqual(
    subject.events.map((event) => event.type),
    ["transaction.updated"],
  );
});

test("replaying the same receipt produces the same persistence identity", async () => {
  const subject = harness({
    status: "success",
    blockNumber: 999n,
    logs: [fillLog(1500000n, 600000n)],
  });
  await subject.reconciler.reconcile({ plan, transactionHash });
  await subject.reconciler.reconcile({ plan, transactionHash });
  assert.equal(subject.saved[0].execution.transactionHash, subject.saved[1].execution.transactionHash);
  assert.equal(subject.saved[0].fills[0].logIndex, subject.saved[1].fills[0].logIndex);
});
