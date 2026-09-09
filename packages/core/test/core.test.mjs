import assert from "node:assert/strict";
import test from "node:test";
import { impliedProbability, isMarketTradable } from "../dist/index.js";

test("impliedProbability clamps malformed and out-of-range values", () => {
  assert.equal(impliedProbability(Number.NaN), 0);
  assert.equal(impliedProbability(-0.1), 0);
  assert.equal(impliedProbability(0.64), 0.64);
  assert.equal(impliedProbability(1.1), 1);
});

test("isMarketTradable requires the trading phase and a future close", () => {
  const market = {
    id: "market-1",
    slug: "market-1",
    question: "Will the test pass?",
    category: "Technology",
    phase: "trading",
    yesPrice: 0.5,
    noPrice: 0.5,
    volumeUsd: 100,
    liquidityUsd: 100,
    closesAt: "2027-01-01T00:00:00.000Z",
  };
  assert.equal(isMarketTradable(market, new Date("2026-01-01T00:00:00.000Z")), true);
  assert.equal(isMarketTradable({ ...market, phase: "paused" }, new Date("2026-01-01T00:00:00.000Z")), false);
  assert.equal(isMarketTradable(market, new Date("2028-01-01T00:00:00.000Z")), false);
});
