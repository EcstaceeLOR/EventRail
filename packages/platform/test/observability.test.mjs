import assert from "node:assert/strict";
import test from "node:test";
import { OperationalMonitor, structuredEvent } from "../dist/index.js";

test("structured telemetry recursively redacts credentials and signing material", () => {
  const event = structuredEvent("plan.failed", "req-1", {
    account: "0x1111111111111111111111111111111111111111",
    authorization: "Bearer real-value",
    nested: { signature: "0xdeadbeef", privateKey: "redact-me" },
  });
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes("real-value"), false);
  assert.equal(serialized.includes("deadbeef"), false);
  assert.equal(serialized.includes("redact-me"), false);
  assert.equal(serialized.includes("[REDACTED]"), true);
});

test("synthetic operational failures trigger actionable release alerts", () => {
  const monitor = new OperationalMonitor();
  monitor.set("rpc_lag_blocks", 6);
  monitor.set("stream_connected", 0);
  monitor.set("settlement_backlog", 101);
  const snapshot = monitor.snapshot(new Date("2026-09-09T10:00:00.000Z"));
  assert.equal(snapshot.status, "degraded");
  assert.deepEqual(
    snapshot.alerts.map((alert) => alert.code),
    ["STREAM_DISCONNECTED", "RPC_LAG", "SETTLEMENT_BACKLOG"],
  );
  assert.match(monitor.prometheus(), /eventrail_rpc_lag_blocks 6/);
});
