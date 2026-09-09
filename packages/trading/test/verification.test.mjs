import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryTradePlanStore,
  PlanVerificationError,
  TradePlanner,
  verifyTradePlan,
} from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const poolAddress = `0x${"11".repeat(20)}`;
const collateralAddress = `0x${"22".repeat(20)}`;
const outcomeTokenAddress = `0x${"33".repeat(20)}`;
const account = `0x${"44".repeat(20)}`;
const otherAccount = `0x${"55".repeat(20)}`;
const freshness = {
  sourceBlock: "990",
  observedAt: "2026-09-09T10:00:02.000Z",
  staleAt: "2026-09-09T10:00:10.000Z",
  authoritative: true,
  state: "fresh",
};
const market = {
  network: "shannon",
  venue: "dreamdex",
  marketId,
  marketAddress: `0x${"66".repeat(20)}`,
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
const quote = {
  version: "1",
  network: "shannon",
  venue: "dreamdex",
  marketId,
  poolAddress,
  collateralDecimals: 6,
  outcome: "up",
  side: "buy",
  mode: "quantity",
  requestedAmount: "1000000",
  quantity: "1000000",
  availableQuantity: "10000000",
  minimumFillQuantity: "1000000",
  notional: "600000",
  fee: "0",
  total: "600000",
  maximumCost: "610000",
  minimumReceive: "0",
  averagePrice: "600000",
  worstPrice: "600000",
  limitPrice: "610000",
  priceImpactBps: "0",
  spread: "10000",
  tickSize: "1000",
  lotSize: "100000",
  sourceBlock: "987",
  observedAt: "2026-09-09T10:00:00.000Z",
  expiresAt: "2026-09-09T10:00:08.000Z",
  marketExpiresAt: market.expiresAt,
  warnings: [],
};
const policy = {
  maxSlippageBps: 100,
  minimumFillBps: 10000,
  minimumTimeRemainingSeconds: 30,
  quoteSourceBlock: quote.sourceBlock,
  quoteExpiresAt: quote.expiresAt,
};

async function plan() {
  return new TradePlanner({
    store: new InMemoryTradePlanStore(),
    clock: () => new Date("2026-09-09T10:00:01.000Z"),
    planId: () => "018f0f9f-7b42-7cc1-8000-000000000001",
  }).create({
    idempotencyKey: "verification-1",
    chainId: 50312,
    account,
    collateralAddress,
    outcomeTokenAddress,
    upTokenId: "1",
    downTokenId: "2",
    quote,
    policy,
  });
}

function reader(overrides = {}) {
  const simulations = [];
  return {
    simulations,
    getMarket: async () => market,
    getBlockNumber: async () => 990n,
    simulate: async (call) => {
      simulations.push(call);
      return { success: true, estimatedGas: 123n };
    },
    ...overrides,
  };
}

test("recomputes the hash, rechecks binding/state, and simulates every exact call", async () => {
  const subject = await plan();
  const chain = reader();
  const result = await verifyTradePlan(subject, {
    expectedChainId: 50312,
    account,
    reader: chain,
    now: new Date("2026-09-09T10:00:03.000Z"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.simulations.length, 2);
  assert.equal(chain.simulations[1].data, subject.calls[1].data);
  assert.equal(chain.simulations[1].gas, BigInt(subject.calls[1].gas));
});

test("changed critical fields, wrong accounts, rollover, and reverts fail closed with UI-safe reasons", async () => {
  const subject = await plan();
  await assert.rejects(
    verifyTradePlan(
      { ...subject, quantity: "2000000" },
      {
        expectedChainId: 50312,
        account,
        reader: reader(),
        now: new Date("2026-09-09T10:00:03.000Z"),
      },
    ),
    (error) => error instanceof PlanVerificationError && error.code === "PLAN_TAMPERED",
  );
  await assert.rejects(
    verifyTradePlan(subject, {
      expectedChainId: 50312,
      account: otherAccount,
      reader: reader(),
      now: new Date("2026-09-09T10:00:03.000Z"),
    }),
    (error) => error instanceof PlanVerificationError && error.code === "ACCOUNT_MISMATCH",
  );
  await assert.rejects(
    verifyTradePlan(subject, {
      expectedChainId: 50312,
      account,
      reader: reader({ getMarket: async () => ({ ...market, poolAddress: otherAccount }) }),
      now: new Date("2026-09-09T10:00:03.000Z"),
    }),
    (error) => error instanceof PlanVerificationError && error.code === "MARKET_ROLLED_OVER",
  );
  await assert.rejects(
    verifyTradePlan(subject, {
      expectedChainId: 50312,
      account,
      reader: reader({ simulate: async () => ({ success: false, error: new Error("revert") }) }),
      now: new Date("2026-09-09T10:00:03.000Z"),
    }),
    (error) =>
      error instanceof PlanVerificationError &&
      error.code === "SIMULATION_FAILED" &&
      error.userMessage.includes("No wallet request"),
  );
});
