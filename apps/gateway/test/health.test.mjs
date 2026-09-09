import assert from "node:assert/strict";
import test from "node:test";
import { createGateway } from "../dist/app.js";
import { OperationalMonitor } from "@eventrail/platform";

test("health route exposes a safe operational payload", async () => {
  const app = createGateway();
  const response = await app.inject({ method: "GET", url: "/v1/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "ok");
  assert.equal(response.json().service, "eventrail-gateway");
  await app.close();
});

test("health and metrics expose synthetic degradation without sensitive data", async () => {
  const monitor = new OperationalMonitor();
  monitor.set("planning_enabled", 0);
  const app = createGateway({ monitor });
  const health = await app.inject({ method: "GET", url: "/v1/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().status, "degraded");
  assert.equal(health.json().planningEnabled, false);
  const metrics = await app.inject({ method: "GET", url: "/metrics" });
  assert.equal(metrics.statusCode, 200);
  assert.match(metrics.body, /eventrail_planning_enabled 0/);
  await app.close();
});

test("the kill switch preserves reads and blocks every new transaction plan", async () => {
  const app = createGateway({ planningEnabled: false });
  assert.equal((await app.inject({ method: "GET", url: "/v1/health" })).statusCode, 200);
  for (const url of [
    "/v1/builders/approval-plans",
    "/v1/trading/quotes",
    "/v1/trading/plans",
    "/v1/funding/routes",
    "/v1/redemptions/plans",
  ]) {
    const response = await app.inject({ method: "POST", url, payload: {} });
    assert.equal(response.statusCode, 503, url);
    assert.equal(response.json().error.code, "UPSTREAM_UNAVAILABLE");
  }
  await app.close();
});

test("unknown routes return a standard 404", async () => {
  const app = createGateway();
  const response = await app.inject({ method: "GET", url: "/private-key" });
  assert.equal(response.statusCode, 404);
  await app.close();
});
