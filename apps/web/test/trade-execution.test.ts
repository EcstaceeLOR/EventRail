import assert from "node:assert/strict";
import test from "node:test";
import { EventRailApiError } from "@eventrail/api-client";
import type { TradePlan, TradeQuote } from "@eventrail/types";
import { isNoWorseThanReviewed, prepareExecutableTrade } from "../lib/trade-execution.ts";

const address = `0x${"11".repeat(20)}` as const;
const marketId = `0x${"ab".repeat(32)}`;
const quote = {
  network: "shannon",
  marketId,
  poolAddress: address,
  outcome: "up",
  side: "buy",
  mode: "spend",
  requestedAmount: "1000000",
  quantity: "2000000",
  maximumCost: "1000000",
  minimumReceive: "0",
  limitPrice: "500000",
  sourceBlock: "100",
  expiresAt: "2030-01-01T00:00:08.000Z",
} as TradeQuote;
const plan = { planId: "plan-1" } as TradePlan;
const input = {
  account: address,
  quote: {
    marketId,
    outcome: "up" as const,
    side: "buy" as const,
    mode: "spend" as const,
    amount: "1000000",
  },
  policy: {
    maxSlippageBps: 100,
    minimumFillBps: 10_000,
    minimumTimeRemainingSeconds: 30,
  },
};

test("retries a recoverable stale-book race with a completely new quote and plan", async () => {
  let quoteCalls = 0;
  let planCalls = 0;
  const delays: number[] = [];
  const client = {
    async createTradeQuote() {
      quoteCalls += 1;
      return { ...quote, sourceBlock: String(99 + quoteCalls) };
    },
    async createTradePlan() {
      planCalls += 1;
      if (planCalls === 1) {
        throw new EventRailApiError(409, "Depth changed", {
          error: { code: "STALE_BOOK", message: "Depth changed", recoverable: true },
        });
      }
      return plan;
    },
  };

  const prepared = await prepareExecutableTrade(client, input, {
    retryDelayMs: 10,
    delay: async (milliseconds) => {
      delays.push(milliseconds);
    },
    idempotencyKey: () => "intent-test",
  });

  assert.equal(prepared.plan, plan);
  assert.equal(prepared.quote.sourceBlock, "101");
  assert.equal(quoteCalls, 2);
  assert.equal(planCalls, 2);
  assert.deepEqual(delays, [10]);
});

test("does not retry permanent trade errors", async () => {
  let attempts = 0;
  const client = {
    async createTradeQuote() {
      attempts += 1;
      throw new EventRailApiError(400, "Invalid amount", {
        error: { code: "INVALID_INPUT", message: "Invalid amount", recoverable: false },
      });
    },
    async createTradePlan() {
      return plan;
    },
  };

  await assert.rejects(prepareExecutableTrade(client, input, { delay: async () => undefined }));
  assert.equal(attempts, 1);
});

test("a post-approval refresh proceeds only when buy terms are unchanged or better", () => {
  assert.equal(
    isNoWorseThanReviewed(quote, {
      ...quote,
      limitPrice: "490000",
      maximumCost: "990000",
      quantity: "2100000",
    }),
    true,
  );
  assert.equal(isNoWorseThanReviewed(quote, { ...quote, maximumCost: "1000001" }), false);
  assert.equal(isNoWorseThanReviewed(quote, { ...quote, quantity: "1900000" }), false);
  assert.equal(isNoWorseThanReviewed(quote, { ...quote, limitPrice: "501000" }), false);
});
