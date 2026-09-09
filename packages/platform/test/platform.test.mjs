import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiAccessError,
  ApiAccessService,
  EVENTRAIL_THEMES,
  InMemoryApiKeyStore,
  deduplicateAnalytics,
  deriveWebhookSecret,
  resolveBuilderAttribution,
  signWebhook,
  summarizeAnalytics,
  validateEmbedConfig,
  verifyWebhook,
} from "../dist/index.js";
test("API keys are origin restricted, revocable, environment scoped, hashed, and quota limited", async () => {
  let now = new Date("2026-01-01T00:00:00Z");
  const store = new InMemoryApiKeyStore();
  const service = new ApiAccessService(store, "test-pepper-at-least-16", () => now);
  const issued = await service.issue({
    integratorId: "int_1",
    label: "browser",
    kind: "public",
    environment: "test",
    allowedOrigins: ["https://app.example.com/path"],
    requestsPerMinute: 1,
  });
  assert.equal("secretHash" in issued.key, false);
  const stored = await store.findByPrefix(issued.key.prefix);
  assert.ok(stored?.secretHash);
  assert.equal(stored.secretHash.includes(issued.token), false);
  await service.authenticate({ token: issued.token, origin: "https://app.example.com", environment: "test" });
  await assert.rejects(
    () =>
      service.authenticate({ token: issued.token, origin: "https://app.example.com", environment: "test" }),
    (error) => error instanceof ApiAccessError && error.code === "RATE_LIMITED",
  );
  now = new Date("2026-01-01T00:01:00Z");
  await assert.rejects(
    () => service.authenticate({ token: issued.token, origin: "https://evil.example", environment: "test" }),
    /origin/i,
  );
  await store.revoke(issued.key.id, now.toISOString());
  await assert.rejects(
    () =>
      service.authenticate({ token: issued.token, origin: "https://app.example.com", environment: "test" }),
    /revoked/i,
  );
});
test("embed safety constraints cannot be weakened", () => {
  const base = {
    version: "1",
    name: "Wallet",
    logoUrl: null,
    theme: EVENTRAIL_THEMES.midnight,
    allowedAssets: ["BTC"],
    allowedCadences: [300],
    defaultSpend: "20",
    risk: { maxSpend: "100", maxSlippageBps: 100, minimumFillBps: 9000, minimumTimeRemainingSeconds: 30 },
    callbacks: { onTradePrepared: true, onTransactionSubmitted: true },
  };
  assert.equal(validateEmbedConfig(base).name, "Wallet");
  assert.throws(() =>
    validateEmbedConfig({ ...base, risk: { ...base.risk, minimumTimeRemainingSeconds: 0 } }),
  );
  assert.throws(() => validateEmbedConfig({ ...base, defaultSpend: "101" }), /maximum/);
});
test("analytics deduplicates chain events and publishes funnel formulas", () => {
  const event = {
    id: "evt-1",
    integratorId: "int",
    environment: "test",
    embedId: "wallet",
    name: "trade_filled",
    transactionHash: "0xABC",
    volume: "42",
    occurredAt: new Date().toISOString(),
  };
  assert.equal(deduplicateAnalytics([event, { ...event, id: "evt-2", transactionHash: "0xabc" }]).length, 1);
  const summary = summarizeAnalytics([
    { ...event, name: "impression", transactionHash: undefined },
    { ...event, id: "evt-2", name: "wallet_connected", transactionHash: undefined },
    event,
  ]);
  assert.equal(summary.connectRate, 1);
  assert.equal(summary.volume, "42");
});
test("webhooks use derived secrets and timestamped HMAC signatures", () => {
  const secret = deriveWebhookSecret("master-key-long-enough", "int", "endpoint", "key-1");
  const signature = signWebhook(secret, 1000, '{"ok":true}');
  assert.equal(verifyWebhook(secret, signature, '{"ok":true}', 1005), true);
  assert.equal(verifyWebhook(secret, signature, "tampered", 1005), false);
});
test("builder attribution fails open unless approval and cap are proven", () => {
  const builder = "0x1111111111111111111111111111111111111111";
  assert.equal(
    resolveBuilderAttribution({ requested: true, builder, feeBpsTimes1k: 1000n }).reason,
    "unsupported",
  );
  assert.equal(
    resolveBuilderAttribution({
      requested: true,
      builder,
      feeBpsTimes1k: 1000n,
      capability: { poolCapBpsTimes1k: 2000n, userApprovalBpsTimes1k: 500n },
    }).enabled,
    false,
  );
  assert.equal(
    resolveBuilderAttribution({
      requested: true,
      builder,
      feeBpsTimes1k: 1000n,
      capability: { poolCapBpsTimes1k: 2000n, userApprovalBpsTimes1k: 1000n },
    }).enabled,
    true,
  );
});
