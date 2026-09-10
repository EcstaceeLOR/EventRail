import assert from "node:assert/strict";
import test from "node:test";
import { FinalizedMarketScanner, runClaimScannerOnSchedule } from "../dist/index.js";

const account = `0x${"11".repeat(20)}`;
const address = `0x${"22".repeat(20)}`;
const marketId = `0x${"33".repeat(32)}`;
const freshness = {
  sourceBlock: "100",
  observedAt: "2030-01-01T00:00:00.000Z",
  staleAt: "2030-01-01T00:01:00.000Z",
  authoritative: true,
  state: "fresh",
};

function market(overrides = {}) {
  return {
    network: "shannon",
    venue: "dreamdex",
    marketId,
    marketAddress: address,
    poolAddress: address,
    poolNonce: "1",
    collateralAddress: address,
    collateralDecimals: 6,
    outcomeTokenAddress: address,
    upTokenId: "1",
    downTokenId: "2",
    question: "Will BTC close up?",
    asset: "BTC",
    oracle: "BTC oracle",
    status: "resolved",
    tradingStart: "2029-12-31T23:55:00.000Z",
    expiresAt: "2030-01-01T00:00:00.000Z",
    cadence: { intervalSeconds: "300", seriesKey: "shannon:BTC:300" },
    lastPrice: "600000",
    cumulativeQuoteVolume: "100",
    backing: "1000000",
    finalized: true,
    resolution: {
      state: "resolved",
      winningOutcome: "up",
      openingPrice: "1",
      resolutionPrice: "2",
      payoutUp: "10000000",
      payoutDown: "0",
      payoutDenominator: "10000000",
    },
    freshness,
    ...overrides,
  };
}

function store() {
  const candidates = new Map();
  let checkpoint = { offset: 0, completed: false };
  return {
    candidates,
    get checkpoint() {
      return checkpoint;
    },
    listTrackedAccounts: async () => [account],
    readCheckpoint: async () => checkpoint,
    writeCheckpoint: async (_network, offset, completed) => {
      checkpoint = { offset, completed };
    },
    upsertCandidates: async (rows) => {
      for (const row of rows) candidates.set(`${row.account}:${row.marketId}:${row.outcome}`, row);
    },
  };
}

test("discovers claimable balances in finalized history even when the live list omits the market", async () => {
  const persistence = store();
  const scanner = new FinalizedMarketScanner({
    network: "shannon",
    pageSize: 10,
    store: persistence,
    reader: {
      listHistoricalMarkets: async () => [market()],
      getOutcomeBalances: async () => ({
        account,
        marketId,
        marketAddress: address,
        up: "9",
        down: "4",
        freshness,
      }),
    },
  });
  const result = await scanner.runOnce();
  assert.deepEqual(result, { markets: 1, candidates: 2, completed: true });
  assert.equal([...persistence.candidates.values()].find((row) => row.outcome === "up").status, "claimable");
  assert.equal([...persistence.candidates.values()].find((row) => row.outcome === "down").status, "no_value");
});

test("voided contracts expose both non-zero legs at the exact half payout", async () => {
  const persistence = store();
  const scanner = new FinalizedMarketScanner({
    network: "shannon",
    pageSize: 10,
    store: persistence,
    reader: {
      listHistoricalMarkets: async () => [
        market({
          status: "voided",
          resolution: {
            ...market().resolution,
            state: "voided",
            winningOutcome: null,
            payoutUp: "5000000",
            payoutDown: "5000000",
          },
        }),
      ],
      getOutcomeBalances: async () => ({
        account,
        marketId,
        marketAddress: address,
        up: "10",
        down: "6",
        freshness,
      }),
    },
  });
  await scanner.runOnce();
  assert.deepEqual([...persistence.candidates.values()].map((row) => row.estimatedPayout).sort(), ["3", "5"]);
});

test("an interrupted page is safely replayed and the checkpoint advances only after completion", async () => {
  const persistence = store();
  const controller = new globalThis.AbortController();
  let calls = 0;
  const reader = {
    listHistoricalMarkets: async () => [market()],
    getOutcomeBalances: async () => {
      calls += 1;
      if (calls === 1) controller.abort();
      return { account, marketId, marketAddress: address, up: "9", down: "0", freshness };
    },
  };
  const scanner = new FinalizedMarketScanner({
    network: "shannon",
    pageSize: 10,
    store: persistence,
    reader,
  });
  const interrupted = await scanner.runOnce(controller.signal);
  assert.equal(interrupted.completed, false);
  assert.deepEqual(persistence.checkpoint, { offset: 0, completed: false });

  const resumed = await scanner.runOnce();
  assert.equal(resumed.completed, true);
  assert.equal(persistence.candidates.size, 1, "replayed candidates stay idempotent");
});

test("the scheduled scanner survives a transient upstream failure", async () => {
  const controller = new globalThis.AbortController();
  const failure = new Error("RPC temporarily unavailable");
  const errors = [];
  let attempts = 0;
  const scanner = {
    async runOnce() {
      attempts += 1;
      if (attempts === 1) throw failure;
      controller.abort();
      return { markets: 0, candidates: 0, completed: true };
    },
  };

  await runClaimScannerOnSchedule(scanner, 1, controller.signal, (error) => errors.push(error));

  assert.equal(attempts, 2);
  assert.deepEqual(errors, [failure]);
});
