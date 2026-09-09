import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createGateway } from "../dist/app.js";
import { ApiAccessService, InMemoryApiKeyStore } from "@eventrail/platform";

function harness() {
  const keyStore = new InMemoryApiKeyStore();
  const accounts = new Map();
  const integrators = {
    async create(name) {
      const row = { id: randomUUID(), name };
      accounts.set(row.id, row);
      return row;
    },
    listKeys: async () => [],
    revoke: (id, at) => keyStore.revoke(id, at),
    saveConfig: async () => {},
    getConfig: async () => null,
    audit: async () => {},
    recordAnalytics: async (events) => events.length,
    analytics: async () => ({}),
    setAnalyticsRetention: async () => {},
    createWebhook: async (integratorId, url, events) => ({
      id: randomUUID(),
      keyId: randomUUID(),
      integratorId,
      url,
      events,
      enabled: true,
    }),
    listWebhooks: async () => [],
    rotateWebhook: async () => null,
    replayWebhook: async () => false,
    listWebhookDeliveries: async () => [],
  };
  return {
    app: createGateway({
      apiAccess: new ApiAccessService(keyStore, "gateway-test-pepper"),
      apiAuthRequired: true,
      apiEnvironment: "test",
      integrators,
      webhookMasterKey: "gateway-webhook-key",
    }),
    keyStore,
  };
}

test("integrator onboarding reveals one secret and public keys enforce origin and revocation", async () => {
  const { app } = harness();
  const onboarding = await app.inject({
    method: "POST",
    url: "/v1/integrators",
    payload: { name: "Demo wallet" },
  });
  assert.equal(onboarding.statusCode, 201);
  const created = onboarding.json();
  assert.match(created.apiKey.token, /^er_sk_test_/);
  assert.equal("secretHash" in created.apiKey.key, false);

  const issue = await app.inject({
    method: "POST",
    url: `/v1/integrators/${created.integrator.id}/keys`,
    headers: { authorization: `Bearer ${created.apiKey.token}` },
    payload: {
      label: "browser",
      kind: "public",
      environment: "test",
      allowedOrigins: ["https://wallet.example"],
      requestsPerMinute: 10,
    },
  });
  assert.equal(issue.statusCode, 201);
  const browser = issue.json();
  const denied = await app.inject({
    method: "GET",
    url: "/v1/data/series",
    headers: { authorization: `Bearer ${browser.token}`, origin: "https://evil.example" },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().error.code, "ORIGIN_DENIED");
  const allowed = await app.inject({
    method: "GET",
    url: "/v1/data/series",
    headers: { authorization: `Bearer ${browser.token}`, origin: "https://wallet.example" },
  });
  assert.equal(allowed.statusCode, 503);
  const revoked = await app.inject({
    method: "DELETE",
    url: `/v1/integrators/${created.integrator.id}/keys/${browser.key.id}`,
    headers: { authorization: `Bearer ${created.apiKey.token}` },
  });
  assert.equal(revoked.statusCode, 204);
  const after = await app.inject({
    method: "GET",
    url: "/v1/data/series",
    headers: { authorization: `Bearer ${browser.token}`, origin: "https://wallet.example" },
  });
  assert.equal(after.statusCode, 401);
  assert.equal(after.json().error.code, "REVOKED_KEY");
  await app.close();
});
