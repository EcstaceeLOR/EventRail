import assert from "node:assert/strict";
import test from "node:test";
import { createRedemptionPlan, RedemptionPlanError } from "../dist/index.js";

const account = `0x${"11".repeat(20)}`;
const address = `0x${"22".repeat(20)}`;
const marketId = `0x${"33".repeat(32)}`;
const source = {
  account,
  network: "shannon",
  marketId,
  marketAddress: address,
  poolAddress: address,
  outcomeTokenAddress: address,
  tokenId: "1",
  outcome: "up",
  question: "Will BTC close up?",
  asset: "BTC",
  cadence: { intervalSeconds: "300", seriesKey: "shannon:BTC:300" },
  status: "resolved",
  expiresAt: "2030-01-01T00:00:00.000Z",
  collateralDecimals: 6,
  balance: "1000000",
  indexedBalance: "1000000",
  costBasis: "600000",
  averageEntryPrice: "600000",
  markPrice: "1000000",
  markValue: "1000000",
  realizedPnl: "0",
  unrealizedPnl: "400000",
  settlementPayout: "1000000",
  redeemedQuantity: "0",
  redemptionPayout: "0",
  claimStatus: "claimable",
  valuationAssumptions: ["fixture"],
  resolution: {
    state: "resolved",
    winningOutcome: "up",
    openingPrice: "1",
    resolutionPrice: "2",
    payoutUp: "10000000",
    payoutDown: "0",
    payoutDenominator: "10000000",
  },
  oracleEvidence: null,
  freshness: {
    sourceBlock: "100",
    observedAt: "2030-01-01T00:00:00.000Z",
    staleAt: "2030-01-01T00:01:00.000Z",
    authoritative: true,
    state: "fresh",
  },
};

const options = {
  account,
  chainId: 50312,
  moduleAddress: address,
  clock: () => new Date("2030-01-01T00:00:00.000Z"),
  planId: () => "00000000-0000-4000-8000-000000000001",
};

test("plans only the winning leg for a resolved market", () => {
  const loser = {
    ...source,
    tokenId: "2",
    outcome: "down",
    settlementPayout: "0",
    claimStatus: "no_value",
  };
  const plan = createRedemptionPlan({ ...options, positions: [source, loser] });
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].outcome, "up");
  assert.equal(plan.calls[1].kind, "redemption");
});

test("plans both non-zero legs for a voided market", () => {
  const up = {
    ...source,
    status: "voided",
    settlementPayout: "500000",
    resolution: { ...source.resolution, state: "voided", winningOutcome: null },
  };
  const down = { ...up, tokenId: "2", outcome: "down" };
  const plan = createRedemptionPlan({ ...options, positions: [up, down] });
  assert.deepEqual(plan.entries.map((entry) => entry.outcome).sort(), ["down", "up"]);
});

test("never creates a plan for only a losing position", () => {
  const loser = {
    ...source,
    tokenId: "2",
    outcome: "down",
    settlementPayout: "0",
    claimStatus: "no_value",
  };
  assert.throws(
    () => createRedemptionPlan({ ...options, positions: [loser] }),
    (error) => error instanceof RedemptionPlanError && error.code === "NOT_CLAIMABLE",
  );
});
