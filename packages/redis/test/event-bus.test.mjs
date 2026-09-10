import assert from "node:assert/strict";
import test from "node:test";
import { DreamDexEventBus, eventStreamKey } from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;

function event(eventId, block, logIndex) {
  return {
    version: "1",
    type: "book.updated",
    eventId,
    sequence: block,
    network: "shannon",
    venue: "dreamdex",
    marketId,
    sourceBlock: block,
    logIndex,
    observedAt: "2026-09-09T10:00:00.000Z",
    payload: { bestBid: "1" },
  };
}

class MemoryStreams {
  events = [];
  dedupe = new Set();
  next = 1;
  async eval(_script, { keys, arguments: args }) {
    if (this.dedupe.has(keys[1])) return null;
    this.dedupe.add(keys[1]);
    const id = `${this.next++}-0`;
    this.events.push({ id, message: { event: args[0] } });
    return id;
  }
  async xRead([{ key, id }]) {
    const start = id === "0-0" ? 0 : this.events.findIndex((entry) => entry.id === id) + 1;
    const messages = this.events.slice(start);
    return messages.length > 0 ? [{ name: key, messages }] : null;
  }
}

test("Redis stream publication is idempotent by normalized eventId", async () => {
  const redis = new MemoryStreams();
  const bus = new DreamDexEventBus(redis);
  assert.equal(await bus.publish(event("same", "100", "2")), "1-0");
  assert.equal(await bus.publish(event("same", "100", "2")), null);
  assert.equal(redis.events.length, 1);
  assert.equal(eventStreamKey("shannon"), "eventrail:v1:shannon:dreamdex:events");
});

test("stream reads order events by block and log while preserving recovery cursors", async () => {
  const redis = new MemoryStreams();
  redis.events = [
    { id: "1-0", message: { event: JSON.stringify(event("late", "101", "0")) } },
    { id: "2-0", message: { event: JSON.stringify(event("second", "100", "2")) } },
    { id: "3-0", message: { event: JSON.stringify(event("first", "100", "1")) } },
  ];
  const bus = new DreamDexEventBus(redis);
  const all = await bus.readBatch("shannon", "0-0", { blockMs: 0 });
  assert.deepEqual(
    all.map((record) => record.event.eventId),
    ["first", "second", "late"],
  );
  const resumed = await bus.readBatch("shannon", "2-0", { blockMs: 0 });
  assert.deepEqual(
    resumed.map((record) => record.event.eventId),
    ["first"],
  );
  assert.equal(resumed[0].cursor, "3-0");
});

test("new subscriptions start at the live stream tail", async () => {
  const observedCursors = [];
  const redis = new MemoryStreams();
  redis.xRead = async ([{ key, id }]) => {
    observedCursors.push(id);
    return [
      {
        name: key,
        messages: [{ id: "4-0", message: { event: JSON.stringify(event("live", "102", "0")) } }],
      },
    ];
  };
  const bus = new DreamDexEventBus(redis);
  const subscription = bus.subscribe({ network: "shannon" });

  const first = await subscription.next();

  assert.equal(observedCursors[0], "$");
  assert.equal(first.value.cursor, "4-0");
  await subscription.return();
});
