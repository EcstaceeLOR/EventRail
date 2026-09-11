import assert from "node:assert/strict";
import test from "node:test";
import { EventRailApiError, EventRailClient, EventRailProtocolError } from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const address = `0x${"11".repeat(20)}`;
const observedAt = "2026-09-09T10:00:00.000Z";
const freshness = {
  sourceBlock: "100",
  observedAt,
  staleAt: "2026-09-09T10:00:10.000Z",
  authoritative: true,
  state: "fresh",
};
const normalizedMarket = {
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
  oracle: "BTC/USD",
  status: "trading",
  tradingStart: observedAt,
  expiresAt: "2026-09-09T11:00:00.000Z",
  cadence: { intervalSeconds: "300", seriesKey: "shannon:BTC:300" },
  lastPrice: "500000",
  cumulativeQuoteVolume: "10",
  backing: "20",
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

test("typed REST methods validate responses and forward cancellation", async () => {
  const controller = new globalThis.AbortController();
  const calls = [];
  const client = new EventRailClient({
    baseUrl: "https://eventrail.test/",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return globalThis.Response.json(normalizedMarket);
    },
  });
  const market = await client.getMarket(marketId, controller.signal);
  assert.equal(market.marketId, marketId);
  assert.equal(calls[0].url, `https://eventrail.test/v1/data/markets/${marketId}`);
  assert.equal(calls[0].init.signal, controller.signal);
});

test("invalid API payloads fail with a protocol error", async () => {
  const client = new EventRailClient({
    baseUrl: "https://eventrail.test",
    fetch: async () => globalThis.Response.json({}),
  });
  await assert.rejects(client.getMarket(marketId), EventRailProtocolError);
});

test("structured API failures expose a readable message instead of raw JSON", async () => {
  const client = new EventRailClient({
    baseUrl: "https://eventrail.test",
    fetch: async () =>
      globalThis.Response.json(
        {
          error: {
            code: "STALE_BOOK",
            message: "The executable quote changed.",
            recoverable: true,
          },
        },
        { status: 409 },
      ),
  });
  await assert.rejects(
    client.getMarket(marketId),
    (error) => error instanceof EventRailApiError && error.message === "The executable quote changed.",
  );
});

test("default browser fetch keeps its required global receiver", async () => {
  const originalFetch = globalThis.fetch;
  let receivedGlobal = false;
  globalThis.fetch = function () {
    receivedGlobal = this === globalThis;
    return Promise.resolve(globalThis.Response.json([]));
  };
  try {
    const client = new EventRailClient({ baseUrl: "/gateway" });
    assert.deepEqual(await client.listMarkets(), []);
    assert.equal(receivedGlobal, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SSE client parses chunk boundaries and reconnects with its last cursor", async () => {
  const controller = new globalThis.AbortController();
  const requestedCursors = [];
  let call = 0;
  const client = new EventRailClient({
    baseUrl: "https://eventrail.test",
    reconnectDelayMs: 0,
    fetch: async (_url, init) => {
      call += 1;
      requestedCursors.push(new Headers(init.headers).get("last-event-id"));
      return sseResponse(call.toString());
    },
  });
  const received = [];
  for await (const record of client.subscribeEvents({ signal: controller.signal })) {
    received.push(record.cursor);
    if (received.length === 2) controller.abort();
  }
  assert.deepEqual(received, ["1-0", "2-0"]);
  assert.deepEqual(requestedCursors, [null, "1-0"]);
});

function sseResponse(sequence) {
  const event = JSON.stringify({
    version: "1",
    type: "market.updated",
    eventId: `event-${sequence}`,
    sequence,
    network: "shannon",
    venue: "dreamdex",
    marketId,
    sourceBlock: sequence,
    logIndex: null,
    observedAt,
    payload: {},
  });
  const encoded = new globalThis.TextEncoder().encode(
    `id: ${sequence}-0\nevent: market.updated\ndata: ${event}\n\n`,
  );
  return new globalThis.Response(
    new globalThis.ReadableStream({
      start(controller) {
        const split = Math.floor(encoded.length / 2);
        controller.enqueue(encoded.slice(0, split));
        controller.enqueue(encoded.slice(split));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
