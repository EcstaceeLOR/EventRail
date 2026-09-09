import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthoritativeWriteGuard,
  ReorgDetectedError,
  ResilientRpcRouter,
  UnsafeWriteError,
  runReconnectingStream,
} from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const address = `0x${"11".repeat(20)}`;

function state(block = "100") {
  const freshness = {
    sourceBlock: block,
    observedAt: "2026-09-09T10:00:00.000Z",
    staleAt: "2026-09-09T10:00:10.000Z",
    authoritative: true,
    state: "fresh",
  };
  return {
    market: { marketId, status: "trading", freshness },
    book: { marketId, poolAddress: address, freshness },
  };
}

test("RPC timeout falls back and opens the failing primary circuit", async () => {
  let primaryCalls = 0;
  const router = new ResilientRpcRouter(
    [
      {
        name: "primary",
        getBlockNumber: () => {
          primaryCalls += 1;
          return new Promise(() => {});
        },
      },
      { name: "fallback", getBlockNumber: async () => 100n },
    ],
    { timeoutMs: 5, failureThreshold: 1 },
  );
  assert.equal(await router.getBlockNumber(), 100n);
  assert.equal(await router.getBlockNumber(), 100n);
  assert.equal(primaryCalls, 1, "open circuits must be skipped");
  assert.equal(router.getHealth()[0].state, "open");
});

test("conflicting canonical hashes detect a reorg and disable writes", () => {
  const router = new ResilientRpcRouter([{ name: "primary", getBlockNumber: async () => 100n }]);
  router.recordCanonicalBlock(99n, `0x${"aa".repeat(32)}`);
  assert.throws(() => router.recordCanonicalBlock(99n, `0x${"bb".repeat(32)}`), ReorgDetectedError);
  assert.equal(router.isWriteSafe(), false);
});

test("dropped streams reconnect with exponential backoff", async () => {
  const controller = new globalThis.AbortController();
  const delays = [];
  const values = [];
  let connects = 0;
  await runReconnectingStream(
    async () => {
      connects += 1;
      const value = connects;
      return (async function* () {
        yield value;
      })();
    },
    {
      signal: controller.signal,
      baseDelayMs: 10,
      sleep: async (delay) => delays.push(delay),
      onValue: (value) => {
        values.push(value);
        if (value === 2) controller.abort();
      },
    },
  );
  assert.deepEqual(values, [1, 2]);
  assert.deepEqual(delays, [10]);
});

test("write guard rejects indexer lag and never invokes the planner", async () => {
  const snapshots = state("90");
  const reader = {
    getMarket: async () => snapshots.market,
    getOrderBook: async () => snapshots.book,
  };
  const router = new ResilientRpcRouter([{ name: "primary", getBlockNumber: async () => 100n }]);
  let planned = false;
  const guard = new AuthoritativeWriteGuard(reader, router, {
    clock: () => new Date("2026-09-09T10:00:01.000Z"),
    maxLagBlocks: 2n,
  });
  await assert.rejects(
    guard.planWrite(marketId, () => {
      planned = true;
    }),
    (error) => error instanceof UnsafeWriteError && error.code === "STATE_LAG",
  );
  assert.equal(planned, false);
});

test("write guard admits only fresh authoritative state", async () => {
  const snapshots = state();
  const reader = {
    getMarket: async () => snapshots.market,
    getOrderBook: async () => snapshots.book,
  };
  const router = new ResilientRpcRouter([{ name: "primary", getBlockNumber: async () => 100n }]);
  const guard = new AuthoritativeWriteGuard(reader, router, {
    clock: () => new Date("2026-09-09T10:00:01.000Z"),
  });
  const result = await guard.planWrite(marketId, ({ chainHead }) => `planned-at-${chainHead}`);
  assert.equal(result, "planned-at-100");
  snapshots.book.freshness.authoritative = false;
  await assert.rejects(
    guard.planWrite(marketId, () => "unsafe"),
    (error) => error instanceof UnsafeWriteError && error.code === "NON_AUTHORITATIVE_STATE",
  );
});
