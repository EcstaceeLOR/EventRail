import assert from "node:assert/strict";
import test from "node:test";
import { createGateway } from "../dist/app.js";

const marketId = `0x${"ab".repeat(32)}`;
const address = `0x${"11".repeat(20)}`;
const account = `0x${"44".repeat(20)}`;
const now = new Date();
const freshness = {
  sourceBlock: "100",
  observedAt: now.toISOString(),
  staleAt: new Date(now.getTime() + 60_000).toISOString(),
  authoritative: true,
  state: "fresh",
};
const market = {
  network: "shannon",
  venue: "dreamdex",
  marketId,
  marketAddress: address,
  poolAddress: address,
  poolNonce: "1",
  collateralAddress: `0x${"22".repeat(20)}`,
  collateralDecimals: 6,
  outcomeTokenAddress: `0x${"33".repeat(20)}`,
  upTokenId: "1",
  downTokenId: "2",
  question: "Will BTC close up?",
  asset: "BTC",
  oracle: "DreamDEX",
  status: "trading",
  tradingStart: new Date(now.getTime() - 60_000).toISOString(),
  expiresAt: new Date(now.getTime() + 300_000).toISOString(),
  cadence: { intervalSeconds: "300", seriesKey: "btc-5m" },
  lastPrice: "600000",
  cumulativeQuoteVolume: "1000000",
  backing: "10000000",
  finalized: false,
  resolution: {
    state: "unresolved",
    winningOutcome: null,
    openingPrice: null,
    resolutionPrice: null,
    payoutUp: null,
    payoutDown: null,
    payoutDenominator: null,
  },
  freshness,
};

function reader(asks = [{ price: "600000", quantity: "10000000" }]) {
  return {
    listLiveMarkets: async () => [market],
    getMarket: async () => market,
    getOrderBook: async () => ({
      network: "shannon",
      venue: "dreamdex",
      marketId,
      poolAddress: address,
      collateralDecimals: 6,
      upBids: [{ price: "590000", quantity: "10000000" }],
      upAsks: asks,
      downBids: [],
      downAsks: [],
      freshness,
    }),
    getBookParameters: async () => ({
      marketId,
      poolAddress: address,
      tickSize: "1000",
      lotSize: "100000",
      minimumQuantity: "100000",
      freshness,
    }),
  };
}

test("trading quote endpoint returns a source-bound, expiring executable quote", async () => {
  const app = createGateway({ dataReader: reader() });
  const response = await app.inject({
    method: "POST",
    url: "/v1/trading/quotes",
    payload: {
      marketId,
      outcome: "up",
      side: "buy",
      mode: "spend",
      amount: "1000000",
      availableBalance: "1000000",
      maxSlippageBps: 100,
    },
  });
  assert.equal(response.statusCode, 200);
  const quote = response.json();
  assert.equal(quote.marketId, marketId);
  assert.equal(quote.sourceBlock, "100");
  assert.ok(Date.parse(quote.expiresAt) > Date.now());
  assert.ok(BigInt(quote.maximumCost) <= 1_000_000n);
  await app.close();
});

test("empty books return an actionable conflict instead of a fabricated quote", async () => {
  const app = createGateway({ dataReader: reader([]) });
  const response = await app.inject({
    method: "POST",
    url: "/v1/trading/quotes",
    payload: { marketId, outcome: "up", side: "buy", mode: "quantity", amount: "100000" },
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "EMPTY_BOOK");
  await app.close();
});

test("plan endpoint binds the account and current immutable market generation", async () => {
  const quoteApp = createGateway({ dataReader: reader() });
  const quoteResponse = await quoteApp.inject({
    method: "POST",
    url: "/v1/trading/quotes",
    payload: { marketId, outcome: "up", side: "buy", mode: "quantity", amount: "100000" },
  });
  const quote = quoteResponse.json();
  await quoteApp.close();
  let planned;
  const app = createGateway({
    dataReader: reader(),
    tradePlanner: {
      create: async (input) => {
        planned = input;
        return { accepted: true };
      },
    },
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/trading/plans",
    payload: {
      account,
      idempotencyKey: "gateway-plan-1",
      quote,
      policy: {
        maxSlippageBps: 100,
        minimumFillBps: 10000,
        minimumTimeRemainingSeconds: 30,
        quoteSourceBlock: quote.sourceBlock,
        quoteExpiresAt: quote.expiresAt,
      },
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(planned.chainId, 50312);
  assert.equal(planned.account, account);
  assert.equal(planned.quote.marketId, marketId);
  await app.close();
});

test("submission handoff validates and durably queues the broadcast hash", async () => {
  let submitted;
  const app = createGateway({
    submissionStore: {
      recordSubmission: async (input) => {
        submitted = input;
      },
    },
  });
  const payload = {
    planId: "018f0f9f-7b42-7cc1-8000-000000000001",
    planHash: `0x${"bb".repeat(32)}`,
    account,
    transactionHash: `0x${"cc".repeat(32)}`,
  };
  const response = await app.inject({ method: "POST", url: "/v1/trading/submissions", payload });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(submitted, payload);
  await app.close();
});

test("activity endpoint applies account-scoped durable filters", async () => {
  let filters;
  const app = createGateway({
    activityReader: {
      list: async (input) => {
        filters = input;
        return [];
      },
    },
  });
  const response = await app.inject({
    method: "GET",
    url: `/v1/data/accounts/${account}/activity?network=shannon&status=filled&marketId=${marketId}`,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(filters, { network: "shannon", account, limit: 100, marketId, status: "filled" });
  await app.close();
});
