import assert from "node:assert/strict";
import test from "node:test";
import { classifyDataState, queryKeys } from "../dist/index.js";

const freshness = {
  sourceBlock: "100",
  observedAt: "2026-09-09T10:00:00.000Z",
  staleAt: "2026-09-09T10:00:10.000Z",
  authoritative: true,
  state: "fresh",
};

test("live hooks expose loading, stale, offline, and terminal states", () => {
  const now = new Date("2026-09-09T10:00:05.000Z");
  assert.equal(classifyDataState({ pending: true, error: false, now }), "loading");
  assert.equal(classifyDataState({ pending: false, error: true, now }), "offline");
  assert.equal(classifyDataState({ pending: false, error: false, freshness, now }), "live");
  assert.equal(
    classifyDataState({ pending: false, error: false, freshness: { ...freshness, state: "stale" }, now }),
    "stale",
  );
  assert.equal(classifyDataState({ pending: false, error: false, terminal: true, now }), "terminal");
});

test("query keys share account and market cache prefixes", () => {
  assert.deepEqual(queryKeys.market("m1"), ["eventrail", "market", "m1"]);
  assert.deepEqual(queryKeys.positions("0xabc").slice(0, 3), ["eventrail", "account", "0xabc"]);
});
