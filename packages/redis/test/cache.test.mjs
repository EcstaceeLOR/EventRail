import assert from "node:assert/strict";
import test from "node:test";
import { DreamDexRedisCache, dataKey } from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const identity = { network: "shannon", marketId };

class MemoryRedis {
  values = new Map();
  async get(key) {
    return this.values.get(key) ?? null;
  }
  async eval(_script, { keys, arguments: args }) {
    const [data, pointer] = keys;
    const [serialized, , block] = args;
    this.values.set(data, serialized);
    const current = this.values.get(pointer);
    const currentBlock = current?.slice(0, current.indexOf("|"));
    if (!currentBlock || BigInt(block) >= BigInt(currentBlock)) this.values.set(pointer, `${block}|${data}`);
    return 1;
  }
}

function freshness(block, staleAt = "2026-09-09T10:00:10.000Z") {
  return {
    sourceBlock: block,
    observedAt: "2026-09-09T10:00:00.000Z",
    staleAt,
    authoritative: true,
    state: "fresh",
  };
}

test("cache keys bind network, venue, market, resource, and source block", async () => {
  const redis = new MemoryRedis();
  const cache = new DreamDexRedisCache(redis, () => new Date("2026-09-09T10:00:01.000Z"));
  const key = await cache.put("book", identity, { bids: [] }, freshness("9007199254740993"));
  assert.equal(key, dataKey("book", identity, "9007199254740993"));
  assert.match(key, /shannon:dreamdex:book:.*:block:9007199254740993$/);
});

test("older writes cannot replace the latest block pointer", async () => {
  const redis = new MemoryRedis();
  const cache = new DreamDexRedisCache(redis, () => new Date("2026-09-09T10:00:01.000Z"));
  await cache.put("market", identity, { version: "new" }, freshness("101"));
  await cache.put("market", identity, { version: "old" }, freshness("99"));
  const result = await cache.get("market", identity, (value) => value);
  assert.equal(result.value.version, "new");
});

test("stale-while-revalidate serves display data but never permits planning", async () => {
  const redis = new MemoryRedis();
  let now = new Date("2026-09-09T10:00:00.000Z");
  const cache = new DreamDexRedisCache(redis, () => now);
  await cache.put("quote", identity, { price: "500000" }, freshness("100"));
  now = new Date("2026-09-09T10:00:01.500Z");
  const stale = await cache.get("quote", identity, (value) => value);
  assert.equal(stale.status, "stale");
  assert.equal(stale.usableForPlanning, false);
  now = new Date("2026-09-09T10:00:04.000Z");
  assert.equal((await cache.get("quote", identity, (value) => value)).status, "miss");
});

test("upstream freshness expires cached data for planning before cache TTL", async () => {
  const redis = new MemoryRedis();
  const cache = new DreamDexRedisCache(redis, () => new Date("2026-09-09T10:00:02.000Z"));
  await cache.put("market", identity, { status: "trading" }, freshness("100", "2026-09-09T10:00:01.000Z"));
  const result = await cache.get("market", identity, (value) => value);
  assert.equal(result.status, "stale");
  assert.equal(result.usableForPlanning, false);
});
