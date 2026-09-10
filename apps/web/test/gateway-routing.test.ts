import assert from "node:assert/strict";
import test from "node:test";
import {
  browserGatewayUrl,
  defaultGatewayUpstream,
  gatewayRewriteDestination,
} from "../lib/gateway-routing.ts";
import {
  gatewayRetryDelay,
  offlineRecoveryInterval,
  shouldRetryGatewayQuery,
} from "../lib/query-recovery.ts";
import { EventRailApiError } from "@eventrail/api-client";

test("browser traffic uses the same-origin gateway proxy", () => {
  assert.equal(browserGatewayUrl, "/gateway");
  assert.equal(
    gatewayRewriteDestination("https://eventrail-preview-gateway.onrender.com/"),
    "https://eventrail-preview-gateway.onrender.com/:path*",
  );
  assert.equal(gatewayRewriteDestination(), `${defaultGatewayUpstream}/:path*`);
});

test("gateway queries recover from transient failures without retrying permanent client errors", () => {
  assert.equal(shouldRetryGatewayQuery(0, new TypeError("network unavailable")), true);
  assert.equal(shouldRetryGatewayQuery(0, new EventRailApiError(503, "unavailable")), true);
  assert.equal(shouldRetryGatewayQuery(0, new EventRailApiError(429, "slow down")), true);
  assert.equal(shouldRetryGatewayQuery(0, new EventRailApiError(404, "missing")), false);
  assert.equal(shouldRetryGatewayQuery(5, new TypeError("network unavailable")), false);
  assert.equal(gatewayRetryDelay(0), 1_000);
  assert.equal(gatewayRetryDelay(10), 8_000);
  assert.equal(offlineRecoveryInterval({ state: { status: "error" } }), 5_000);
  assert.equal(offlineRecoveryInterval({ state: { status: "success" } }), false);
});
