import assert from "node:assert/strict";
import test from "node:test";
import { calculateTradeQuote, QuoteError } from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const poolAddress = `0x${"11".repeat(20)}`;
const collateralAddress = `0x${"22".repeat(20)}`;
const outcomeTokenAddress = `0x${"33".repeat(20)}`;
const now = new Date("2026-09-09T10:00:00.000Z");
const freshness = {
  sourceBlock: "987",
  observedAt: now.toISOString(),
  staleAt: "2026-09-09T10:00:08.000Z",
  authoritative: true,
  state: "fresh",
};
const market = {
  network: "shannon",
  venue: "dreamdex",
  marketId,
  marketAddress: `0x${"44".repeat(20)}`,
  poolAddress,
  poolNonce: "1",
  collateralAddress,
  collateralDecimals: 6,
  outcomeTokenAddress,
  upTokenId: "1",
  downTokenId: "2",
  question: "Will BTC close up?",
  asset: "BTC",
  oracle: "DreamDEX",
  status: "trading",
  tradingStart: "2026-09-09T09:55:00.000Z",
  expiresAt: "2026-09-09T10:05:00.000Z",
  cadence: { intervalSeconds: "300", seriesKey: "btc-5m" },
  lastPrice: "600000",
  cumulativeQuoteVolume: "0",
  backing: "0",
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

function book(upAsks = [{ price: "600000", quantity: "10000000" }]) {
  return {
    network: "shannon",
    venue: "dreamdex",
    marketId,
    poolAddress,
    collateralDecimals: 6,
    upBids: [{ price: "590000", quantity: "10000000" }],
    upAsks,
    downBids: [],
    downAsks: [],
    freshness,
  };
}

const policy = {
  outcome: "up",
  side: "buy",
  mode: "quantity",
  amount: "1500000",
  tickSize: "1000",
  lotSize: "100000",
  minimumQuantity: "100000",
  feeBps: 25,
  maxSlippageBps: 2_000,
  now,
};

test("quantity quotes walk depth, snap bounds, include fees, source block, and hard expiry", () => {
  const quote = calculateTradeQuote(
    market,
    book([
      { price: "600000", quantity: "1000000" },
      { price: "650000", quantity: "1000000" },
    ]),
    policy,
  );
  assert.equal(quote.quantity, "1500000");
  assert.equal(quote.notional, "925000");
  assert.equal(quote.fee, "2313");
  assert.equal(quote.total, "927313");
  assert.equal(quote.maximumCost, "1082700");
  assert.equal(quote.averagePrice, "616667");
  assert.equal(quote.worstPrice, "650000");
  assert.equal(quote.limitPrice, "720000");
  assert.equal(quote.sourceBlock, "987");
  assert.equal(quote.expiresAt, "2026-09-09T10:00:08.000Z");
});

test("spend quotes never exceed the user's balance or budget", () => {
  const quote = calculateTradeQuote(market, book(), {
    ...policy,
    mode: "spend",
    amount: "1000000",
    collateralBalance: "1000000",
  });
  assert.ok(BigInt(quote.total) <= 1_000_000n);
  assert.equal(BigInt(quote.quantity) % 100_000n, 0n);
});

test("empty, thin, stale, near-expiry, and insufficient-balance quotes fail actionably", () => {
  assert.throws(
    () => calculateTradeQuote(market, book([]), policy),
    (error) => error instanceof QuoteError && error.code === "EMPTY_BOOK" && error.recoverable,
  );
  assert.throws(
    () => calculateTradeQuote(market, book([{ price: "600000", quantity: "100000" }]), policy),
    (error) => error instanceof QuoteError && error.code === "INSUFFICIENT_LIQUIDITY",
  );
  assert.throws(
    () => calculateTradeQuote(market, { ...book(), freshness: { ...freshness, state: "stale" } }, policy),
    (error) => error instanceof QuoteError && error.code === "STALE_BOOK",
  );
  assert.throws(
    () => calculateTradeQuote({ ...market, expiresAt: "2026-09-09T10:00:20.000Z" }, book(), policy),
    (error) => error instanceof QuoteError && error.code === "MARKET_TOO_CLOSE_TO_EXPIRY",
  );
  assert.throws(
    () => calculateTradeQuote(market, book(), { ...policy, collateralBalance: "1" }),
    (error) => error instanceof QuoteError && error.code === "INSUFFICIENT_BALANCE",
  );
});
