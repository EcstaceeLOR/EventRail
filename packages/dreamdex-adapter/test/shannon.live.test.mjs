import assert from "node:assert/strict";
import test from "node:test";
import { createDreamDexAdapter } from "../dist/index.js";

test("live Shannon read smoke", { skip: process.env.DREAMDEX_LIVE_TEST !== "1" }, async () => {
  const controller = new globalThis.AbortController();
  try {
    const adapter = createDreamDexAdapter({ network: "shannon", signal: controller.signal });
    const live = await adapter.listLiveMarkets();
    const candidates = live.length > 0 ? live : await adapter.listHistoricalMarkets({ limit: 1 });
    assert.ok(candidates.length > 0, "Shannon should expose at least one binary market");
    const selected = candidates[0];
    const market = await adapter.getMarket(selected.marketId);
    assert.equal(market.marketId, selected.marketId);
    const book = await adapter.getOrderBook(selected.marketId, 2);
    assert.equal(book.marketId, selected.marketId);
  } finally {
    controller.abort();
  }
});
