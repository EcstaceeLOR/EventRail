import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiErrorEnvelopeSchema,
  MarketPageSchema,
  StreamEventSchema,
  TradePlanRequestSchema,
  TransactionPlanSchema,
} from "../dist/index.js";

const observedAt = "2026-09-09T10:00:00.000Z";
const account = "0x1111111111111111111111111111111111111111";

test("v1 market pages carry cursor and freshness metadata", () => {
  const result = MarketPageSchema.parse({
    data: [
      {
        id: "42",
        slug: "somnia-100m-transactions",
        question: "Will Somnia process 100 million daily transactions by 2027?",
        category: "crypto",
        phase: "trading",
        yesPrice: 0.63,
        noPrice: 0.37,
        volumeUsd: 12_340,
        liquidityUsd: 4_000,
        closesAt: "2027-01-01T00:00:00.000Z",
        network: "shannon",
        freshness: {
          observedAt,
          sourceBlock: 1234,
          indexedBlock: 1232,
          staleAfter: "2026-09-09T10:00:10.000Z",
        },
      },
    ],
    page: { nextCursor: "market_42", hasNextPage: true },
  });
  assert.equal(result.data[0]?.freshness?.sourceBlock, 1234);
});

test("v1 transaction plans bind intent to source state and expiry", () => {
  const plan = TransactionPlanSchema.parse({
    version: "1",
    planId: "01991c18-b9c8-7000-8000-000000000001",
    planHash: `0x${"ab".repeat(32)}`,
    network: "shannon",
    chainId: 50312,
    account,
    calls: [{ to: account, data: "0x1234", value: "0" }],
    summary: "Buy 5 USDSO of YES on market 42",
    sourceBlock: 1234,
    observedAt,
    expiresAt: "2026-09-09T10:00:30.000Z",
    assumptions: ["Best ask remains within 100 bps"],
    expectedEffects: ["YES position increases"],
  });
  assert.equal(plan.chainId, 50312);
});

test("trade requests reject invalid accounts and excessive slippage", () => {
  assert.equal(
    TradePlanRequestSchema.safeParse({
      marketId: "42",
      outcome: "yes",
      amountUsdso: "5",
      account: "0xnope",
      maxSlippageBps: 10_001,
    }).success,
    false,
  );
});

test("stream envelopes and API errors use stable discriminators", () => {
  const event = StreamEventSchema.parse({
    version: "1",
    type: "book.updated",
    eventId: "1234:42:7",
    sequence: 7,
    network: "shannon",
    marketId: "42",
    sourceBlock: 1234,
    observedAt,
    payload: { bestBid: 0.62, bestAsk: 0.64 },
  });
  assert.equal(event.type, "book.updated");

  const error = ApiErrorEnvelopeSchema.parse({
    error: { code: "STALE_MARKET_STATE", message: "Quote is stale", requestId: "req_01", recoverable: true },
  });
  assert.equal(error.error.recoverable, true);
});
