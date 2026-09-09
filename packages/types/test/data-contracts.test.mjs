import assert from "node:assert/strict";
import test from "node:test";
import {
  DataStreamEventSchema,
  DataFreshnessSchema,
  NormalizedMarketSchema,
  UnsignedIntegerStringSchema,
} from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const address = `0x${"11".repeat(20)}`;
const observedAt = "2026-09-09T10:00:00.000Z";
const freshness = {
  sourceBlock: "900719925474099312345",
  observedAt,
  staleAt: "2026-09-09T10:00:10.000Z",
  authoritative: true,
  state: "fresh",
};

test("normalized markets preserve exact integer values through JSON", () => {
  const market = NormalizedMarketSchema.parse({
    network: "shannon",
    venue: "dreamdex",
    marketId,
    marketAddress: address,
    poolAddress: address,
    poolNonce: "7",
    collateralAddress: address,
    collateralDecimals: 6,
    outcomeTokenAddress: address,
    upTokenId: "1",
    downTokenId: "2",
    question: "Will BTC close higher?",
    asset: "BTC",
    oracle: "PYTH",
    status: "trading",
    tradingStart: observedAt,
    expiresAt: "2026-09-09T10:05:00.000Z",
    cadence: { intervalSeconds: "300", seriesKey: "BTC:300" },
    lastPrice: "500001",
    cumulativeQuoteVolume: "900719925474099312345",
    backing: "10000000",
    finalized: false,
    resolution: {
      state: "unresolved",
      winningOutcome: null,
      openingPrice: "110000.25",
      resolutionPrice: null,
      payoutUp: null,
      payoutDown: null,
      payoutDenominator: null,
    },
    freshness,
  });
  const decoded = NormalizedMarketSchema.parse(JSON.parse(JSON.stringify(market)));
  assert.equal(decoded.cumulativeQuoteVolume, "900719925474099312345");
});

test("runtime contracts reject floats, negative uints, and imprecise numbers", () => {
  assert.equal(UnsignedIntegerStringSchema.safeParse("1.2").success, false);
  assert.equal(UnsignedIntegerStringSchema.safeParse("-1").success, false);
  assert.equal(UnsignedIntegerStringSchema.safeParse(Number.MAX_SAFE_INTEGER + 2).success, false);
  assert.equal(DataFreshnessSchema.safeParse({ ...freshness, sourceBlock: 123 }).success, false);
});

test("data events have stable ordering and deduplication coordinates", () => {
  const event = DataStreamEventSchema.parse({
    version: "1",
    type: "market.settled",
    eventId: `${marketId}:99:2`,
    sequence: "11",
    network: "shannon",
    venue: "dreamdex",
    marketId,
    sourceBlock: "99",
    logIndex: "2",
    observedAt,
    payload: { winner: "up" },
  });
  assert.equal(event.eventId, `${marketId}:99:2`);
});
