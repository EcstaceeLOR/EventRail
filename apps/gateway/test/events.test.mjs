import assert from "node:assert/strict";
import test from "node:test";
import { createGateway, formatSseRecord } from "../dist/app.js";

const marketId = `0x${"ab".repeat(32)}`;
const record = {
  cursor: "123-0",
  event: {
    version: "1",
    type: "market.settled",
    eventId: "settled:1",
    sequence: "123",
    network: "shannon",
    venue: "dreamdex",
    marketId,
    sourceBlock: "123",
    logIndex: null,
    observedAt: "2026-09-09T10:00:00.000Z",
    payload: { winner: "up" },
  },
};

test("SSE records expose Redis recovery cursor and normalized event schema", () => {
  const encoded = formatSseRecord(record);
  assert.match(encoded, /^id: 123-0\nevent: market\.settled\ndata: /);
  assert.match(encoded, /"sourceBlock":"123"/);
});

test("SSE gateway resumes from Last-Event-ID", async () => {
  let subscription;
  const app = createGateway({
    eventStream: {
      async *subscribe(options) {
        subscription = options;
        yield record;
      },
    },
  });
  const response = await app.inject({
    method: "GET",
    url: "/v1/events?network=shannon",
    headers: { "last-event-id": "122-0" },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /^text\/event-stream/);
  assert.equal(subscription.cursor, "122-0");
  assert.match(response.body, /id: 123-0/);
  await app.close();
});

test("SSE gateway exposes CORS headers to an allowed browser origin", async () => {
  const app = createGateway({
    allowedOrigins: ["https://eventrail.vercel.app"],
    eventStream: {
      async *subscribe() {
        yield record;
      },
    },
  });
  const response = await app.inject({
    method: "GET",
    url: "/v1/events?network=shannon",
    headers: { origin: "https://eventrail.vercel.app" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "https://eventrail.vercel.app");
  assert.equal(response.headers.vary, "Origin");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  await app.close();
});
