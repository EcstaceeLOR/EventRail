import assert from "node:assert/strict";
import test from "node:test";
import { createGateway } from "../dist/app.js";

const account = `0x${"11".repeat(20)}`;
const address = `0x${"22".repeat(20)}`;
const marketId = `0x${"33".repeat(32)}`;
const position = {
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
    observedAt: new Date().toISOString(),
    staleAt: new Date(Date.now() + 60_000).toISOString(),
    authoritative: true,
    state: "fresh",
  },
};

test("redemption plans are built only after a fresh account reconciliation", async () => {
  let reads = 0;
  const app = createGateway({
    dataReader: {
      getPortfolioSnapshot: async () => {
        reads += 1;
        return { account, positions: [position], freshness: position.freshness };
      },
    },
    redemption: { chainId: 50312, moduleAddress: address },
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/redemptions/plans",
    payload: { account, marketId },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(reads, 1);
  assert.equal(response.json().entries[0].outcome, "up");
  assert.deepEqual(
    response.json().calls.map((call) => call.kind),
    ["approval", "redemption"],
  );
  await app.close();
});

test("a losing-only balance never becomes a redemption transaction", async () => {
  const loser = {
    ...position,
    tokenId: "2",
    outcome: "down",
    claimStatus: "no_value",
    settlementPayout: "0",
  };
  const app = createGateway({
    dataReader: {
      getPortfolioSnapshot: async () => ({ account, positions: [loser], freshness: position.freshness }),
    },
    redemption: { chainId: 50312, moduleAddress: address },
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/redemptions/plans",
    payload: { account, marketId },
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "NOT_CLAIMABLE");
  await app.close();
});
