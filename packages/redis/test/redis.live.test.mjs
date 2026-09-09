import assert from "node:assert/strict";
import test from "node:test";
import { DreamDexRedisCache, connectEventRailRedis, latestKey } from "../dist/index.js";

test("Redis cache integration", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const client = await connectEventRailRedis(process.env.TEST_REDIS_URL);
  const identity = { network: "shannon", marketId: `0x${"fe".repeat(32)}`, variant: "integration" };
  const cache = new DreamDexRedisCache(client);
  let dataKey;
  try {
    dataKey = await cache.put(
      "market",
      identity,
      { status: "trading" },
      {
        sourceBlock: "123",
        observedAt: new Date().toISOString(),
        staleAt: new Date(Date.now() + 10_000).toISOString(),
        authoritative: true,
        state: "fresh",
      },
    );
    const result = await cache.get("market", identity, (value) => value);
    assert.equal(result.status, "fresh");
    assert.deepEqual(result.value, { status: "trading" });
  } finally {
    await client.del([...(dataKey ? [dataKey] : []), latestKey("market", identity)]);
    await client.close();
  }
});
