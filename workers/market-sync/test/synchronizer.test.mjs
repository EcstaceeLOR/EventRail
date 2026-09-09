import assert from "node:assert/strict";
import test from "node:test";
import { MarketStateTransitionError, MarketSynchronizer } from "../dist/index.js";

const address = `0x${"11".repeat(20)}`;
const firstId = `0x${"aa".repeat(32)}`;
const secondId = `0x${"bb".repeat(32)}`;
const now = "2026-09-09T10:00:00.000Z";

function market(marketId, status, tradingStart, block) {
  return {
    network: "shannon",
    venue: "dreamdex",
    marketId,
    marketAddress: address,
    poolAddress: address,
    poolNonce: marketId === firstId ? "1" : "2",
    collateralAddress: address,
    collateralDecimals: 6,
    outcomeTokenAddress: address,
    upTokenId: "1",
    downTokenId: "2",
    question: "Will BTC close up?",
    asset: "BTC",
    oracle: "BTC/USD",
    status,
    tradingStart,
    expiresAt: "2026-09-09T11:00:00.000Z",
    cadence: { intervalSeconds: "300", seriesKey: "shannon:BTC:300" },
    lastPrice: "500000",
    cumulativeQuoteVolume: "1",
    backing: "10",
    finalized: status === "resolved" || status === "voided",
    resolution: {
      state: status === "voided" ? "voided" : status === "resolved" ? "resolved" : "unresolved",
      winningOutcome: status === "resolved" ? "up" : null,
      openingPrice: null,
      resolutionPrice: null,
      payoutUp: null,
      payoutDown: null,
      payoutDenominator: null,
    },
    freshness: {
      sourceBlock: block,
      observedAt: now,
      staleAt: "2026-09-09T10:10:00.000Z",
      authoritative: true,
      state: "fresh",
    },
  };
}

class MemoryRepository {
  generations = new Map();
  heads = new Map();
  async findGeneration(network, id) {
    return this.generations.get(`${network}:${id}`) ?? null;
  }
  async upsertGeneration(value) {
    this.generations.set(`${value.network}:${value.marketId}`, value);
  }
  async findSeriesHead(network, seriesKey) {
    return this.heads.get(`${network}:${seriesKey}`) ?? null;
  }
  async setSeriesHead(value) {
    this.heads.set(`${value.network}:${value.cadence.seriesKey}`, value);
  }
}

function adapterWith(runs) {
  let index = 0;
  return {
    listLiveMarkets: async () => runs[index].live,
    listHistoricalMarkets: async () => runs[index++].historical,
  };
}

test("synchronizer persists pool generations by marketId and emits one deterministic rollover", async () => {
  const first = market(firstId, "trading", "2026-09-09T09:55:00.000Z", "100");
  const locked = market(firstId, "locked", "2026-09-09T09:55:00.000Z", "110");
  const second = market(secondId, "listed", "2026-09-09T10:05:00.000Z", "110");
  const repository = new MemoryRepository();
  const events = [];
  const sync = new MarketSynchronizer(
    adapterWith([
      { live: [first], historical: [] },
      { live: [locked, second], historical: [] },
      { live: [locked, second], historical: [] },
    ]),
    repository,
    { publish: async (event) => events.push(event) },
    { clock: () => new Date(now) },
  );

  assert.equal((await sync.synchronize()).rollovers, 0);
  assert.equal((await sync.synchronize()).rollovers, 1);
  assert.equal((await sync.synchronize()).rollovers, 0);
  assert.equal(repository.generations.size, 2, "reused pool address must not collapse generations");
  assert.equal(events[0].type, "market.rolled-over");
  assert.equal(events[0].payload.previousMarketId, firstId);
  assert.equal(events[0].payload.currentMarketId, secondId);
});

test("synchronizer emits terminal transitions and rejects state regression", async () => {
  const repository = new MemoryRepository();
  const events = [];
  const first = market(firstId, "trading", "2026-09-09T09:55:00.000Z", "100");
  const resolved = market(firstId, "resolved", "2026-09-09T09:55:00.000Z", "120");
  const regressed = market(firstId, "trading", "2026-09-09T09:55:00.000Z", "130");
  const sync = new MarketSynchronizer(
    adapterWith([
      { live: [first], historical: [] },
      { live: [], historical: [resolved] },
      { live: [regressed], historical: [] },
    ]),
    repository,
    { publish: async (event) => events.push(event) },
    { clock: () => new Date(now) },
  );
  await sync.synchronize();
  assert.equal((await sync.synchronize()).terminalTransitions, 1);
  assert.equal(events[0].type, "market.settled");
  await assert.rejects(sync.synchronize(), MarketStateTransitionError);
});

test("synchronizer fails closed on stale non-authoritative snapshots", async () => {
  const stale = market(firstId, "trading", "2026-09-09T09:55:00.000Z", "100");
  stale.freshness.authoritative = false;
  const sync = new MarketSynchronizer(
    adapterWith([{ live: [stale], historical: [] }]),
    new MemoryRepository(),
    { publish: async () => {} },
    { clock: () => new Date(now) },
  );
  await assert.rejects(sync.synchronize(), /not fresh authoritative state/);
});
