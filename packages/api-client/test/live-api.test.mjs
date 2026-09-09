import assert from "node:assert/strict";
import test from "node:test";
import { EventRailClient } from "../dist/index.js";

test("live EventRail Shannon API integration", { skip: !process.env.EVENTRAIL_LIVE_API_URL }, async () => {
  const client = new EventRailClient({ baseUrl: process.env.EVENTRAIL_LIVE_API_URL });
  const series = await client.listSeries("shannon");
  assert.ok(series.length > 0);
  const market = await client.getMarket(series[0].currentMarketId);
  assert.equal(market.network, "shannon");
});
