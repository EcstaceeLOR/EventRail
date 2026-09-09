import assert from "node:assert/strict";
import test from "node:test";
import { DreamDexAdapterError, ProductionDreamDexAdapter } from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const otherMarketId = `0x${"cd".repeat(32)}`;
const address = `0x${"11".repeat(20)}`;
const txHash = `0x${"ef".repeat(32)}`;
const account = `0x${"33".repeat(20)}`;

function market(overrides = {}) {
  return {
    id: marketId,
    marketId,
    marketType: "BINARY",
    poolAddress: address,
    marketAddress: address,
    yesTokenId: "1",
    noTokenId: "2",
    collateral: address,
    asset: "BTC",
    question: "Will BTC close up?",
    oracleQuestion: "BTC/USD close >= open",
    status: "Trading",
    strike: "0",
    mode: "reference",
    tradingStart: "1900000000",
    expiry: "1900000300",
    winningOutcome: null,
    resolvedAtBlock: null,
    resolvedAtTimestamp: null,
    createdByTx: txHash,
    voided: false,
    backing: "1000000",
    lastPrice: "600000",
    lastTradeAt: "1900000010",
    cumulativeBaseVolume: "100",
    cumulativeQuoteVolume: "60",
    tradeCount: "1",
    baseDecimals: 6,
    quoteDecimals: 6,
    createdAtTimestamp: "1899999990",
    createdAtBlock: "80",
    intervalSec: "300",
    ...overrides,
  };
}

function onchain(overrides = {}) {
  return {
    marketAddress: address,
    outcomeToken: address,
    yesId: 1n,
    noId: 2n,
    pool: address,
    nonce: 7n,
    collateral: address,
    status: 1,
    backing: 1_000_000n,
    finalized: false,
    expiry: 1_900_000_300n,
    decimals: 6,
    winningOutcome: 0,
    isResolved: false,
    isVoided: false,
    voidPolicy: null,
    ...overrides,
  };
}

function fixture() {
  const calls = [];
  const sdk = {
    listLiveBinaryMarkets: async () => [market()],
    listPastBinaryMarkets: async () => [market()],
    getBinaryMarket: async (id) => (id.toLowerCase() === marketId ? market() : null),
    getMarketOnchain: async () => onchain(),
    getOpeningPrices: async () => ({ [marketId]: "70000" }),
    getResolutionPrices: async () => ({ [marketId]: null }),
    getBinaryOrderBook: async (pool, options) => {
      calls.push(["book", pool, options]);
      return {
        yesBids: [{ price: 590000n, quantity: 10n }],
        yesAsks: [{ price: 610000n, quantity: 20n }],
        noBids: [{ price: 390000n, quantity: 20n }],
        noAsks: [{ price: 410000n, quantity: 10n }],
      };
    },
    getFills: async (pool, options) => {
      calls.push(["fills", pool, options]);
      return [
        {
          id: "90_2",
          market: marketId,
          pool: address,
          fillPrice: "600000",
          quantity: "10",
          quoteQuantity: "6",
          maker: address,
          makerSide: "SELL_YES",
          taker: account,
          takerSide: "BUY_YES",
          kind: "DIRECT_YES",
          takerIsBid: true,
          takerOrder: { owner: account, side: "BUY_YES" },
          makerOrderId: "1",
          takerOrderId: "2",
          timestamp: "1900000010",
          txHash,
        },
        {
          id: "91_1",
          market: otherMarketId,
          pool: address,
          fillPrice: "500000",
          quantity: "1",
          quoteQuantity: "1",
          maker: null,
          makerSide: "SELL_YES",
          taker: null,
          takerSide: "BUY_YES",
          kind: "DIRECT_YES",
          takerIsBid: true,
          takerOrder: null,
          makerOrderId: "3",
          takerOrderId: "4",
          timestamp: "1900000020",
          txHash,
        },
      ];
    },
    getCandles: async (pool, interval, options) => {
      calls.push(["candles", pool, interval, options]);
      return [
        {
          bucketStart: "1900000000",
          openPrice: "500000",
          high: "620000",
          low: "490000",
          closePrice: "600000",
          baseVolume: "10",
          quoteVolume: "6",
          tradeCount: 2,
        },
        {
          bucketStart: "1899999000",
          openPrice: "1",
          high: "1",
          low: "1",
          closePrice: "1",
          baseVolume: "1",
          quoteVolume: "1",
          tradeCount: 1,
        },
      ];
    },
    getMarketResolution: async () => ({
      events: [],
      reference: null,
      closingAnswer: null,
      openingAnswer: null,
      oracleAnswer: null,
    }),
    getOnchainResolutionPrice: async () => ({
      numericValue: "70100",
      decimals: 2,
      voided: false,
      adapter: address,
      oracleQuestionId: "1",
    }),
    getOpenPositionsWithPnL: async () => [
      {
        market: { id: marketId, poolAddress: address },
        outcomes: {
          yes: { balance: 10n, avgCost: 500000n, realizedPnl: 2n, unrealizedPnl: 1n },
          no: { balance: 0n, avgCost: 0n, realizedPnl: 0n, unrealizedPnl: null },
        },
      },
    ],
    getClaimable: async () => [
      { marketId, pool: address, outcomeIdx: 0, amount: 10n, estPayout: 9n, status: "Resolved" },
    ],
    getOutcomeBalances: async () => ({ yes: "10", no: "0" }),
  };
  const adapter = new ProductionDreamDexAdapter({
    sdk,
    chainReader: { getBlockNumber: async () => 100n },
    clock: () => new Date("2030-03-17T17:46:40.000Z"),
  });
  return { adapter, calls, sdk };
}

test("adapter normalizes live and historical market discovery", async () => {
  const { adapter } = fixture();
  const [live, past] = await Promise.all([
    adapter.listLiveMarkets(),
    adapter.listHistoricalMarkets({ limit: 5 }),
  ]);
  assert.equal(live[0].marketId, marketId);
  assert.equal(past[0].poolNonce, "7");
  assert.equal(live[0].freshness.sourceBlock, "100");
  assert.equal(live[0].resolution.openingPrice, "70000");
});

test("books and pool histories resolve binding and stay inside the market window", async () => {
  const { adapter, calls } = fixture();
  const [book, fills, candles] = await Promise.all([
    adapter.getOrderBook(marketId, 10),
    adapter.getFills(marketId),
    adapter.getCandles(marketId, 60),
  ]);
  assert.equal(book.upBids[0].price, "590000");
  assert.equal(fills.length, 1, "a recycled pool's other market must be excluded");
  assert.equal(candles.length, 1, "pre-market candles must be excluded");
  assert.deepEqual(calls.find(([name]) => name === "fills")[2], { since: 1900000000, until: 1900000300 });
});

test("settlement, PnL, claims, and outcome balances use normalized exact values", async () => {
  const { adapter } = fixture();
  const [resolution, positions, claims, balances] = await Promise.all([
    adapter.getResolution(marketId),
    adapter.getPositions(account),
    adapter.getClaims(account),
    adapter.getOutcomeBalances(account, marketId),
  ]);
  assert.equal(resolution.resolution.resolutionPrice, "70100");
  assert.equal(positions[0].averageEntryPrice, "500000");
  assert.equal(claims[0].estimatedPayout, "9");
  assert.equal(balances.up, "10");
});

test("invalid upstream rows become typed adapter errors", async () => {
  const { adapter, sdk } = fixture();
  sdk.getFills = async () => [{ id: "bad", market: marketId, timestamp: "1900000010" }];
  await assert.rejects(
    adapter.getFills(marketId),
    (error) => error instanceof DreamDexAdapterError && error.kind === "invalid_upstream",
  );
});
