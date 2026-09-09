import assert from "node:assert/strict";
import test from "node:test";
import { calculatePositionValuation } from "../dist/index.js";

const unresolved = {
  state: "unresolved",
  winningOutcome: null,
  openingPrice: null,
  resolutionPrice: null,
  payoutUp: null,
  payoutDown: null,
  payoutDenominator: null,
};

function value(overrides = {}) {
  return calculatePositionValuation({
    balance: 1_000_000n,
    indexedBalance: 1_000_000n,
    indexedCostBasis: 400_000n,
    indexedAverageEntryPrice: 400_000n,
    indexedMarkPrice: 600_000n,
    indexedRealizedPnl: 0n,
    resolution: unresolved,
    outcome: "up",
    collateralDecimals: 6,
    ...overrides,
  });
}

test("values a resolved winner at its exact payout", () => {
  const result = value({ resolution: { ...unresolved, state: "resolved", winningOutcome: "up" } });
  assert.equal(result.markPrice, 1_000_000n);
  assert.equal(result.settlementPayout, 1_000_000n);
  assert.equal(result.unrealizedPnl, 600_000n);
  assert.equal(result.claimStatus, "claimable");
});

test("never presents a resolved losing position as payable", () => {
  const result = value({ resolution: { ...unresolved, state: "resolved", winningOutcome: "down" } });
  assert.equal(result.settlementPayout, 0n);
  assert.equal(result.claimStatus, "no_value");
});

test("values both sides of a void at one half", () => {
  const result = value({ outcome: "down", resolution: { ...unresolved, state: "voided" } });
  assert.equal(result.markPrice, 500_000n);
  assert.equal(result.settlementPayout, 500_000n);
  assert.equal(result.claimStatus, "claimable");
});

test("scales cost basis to an authoritative partially-sold balance", () => {
  const result = value({
    balance: 400_000n,
    indexedBalance: 1_000_000n,
    indexedRealizedPnl: 75_000n,
  });
  assert.equal(result.costBasis, 160_000n);
  assert.equal(result.markValue, 240_000n);
  assert.equal(result.realizedPnl, 75_000n);
});

test("keeps an empty redeemed position as claimed without a phantom value", () => {
  const result = value({
    balance: 0n,
    indexedBalance: 0n,
    indexedCostBasis: 0n,
    indexedAverageEntryPrice: null,
    redeemedQuantity: 1_000_000n,
    redemptionPayout: 1_000_000n,
    resolution: { ...unresolved, state: "resolved", winningOutcome: "up" },
  });
  assert.equal(result.costBasis, 0n);
  assert.equal(result.markValue, 0n);
  assert.equal(result.claimStatus, "claimed");
});
