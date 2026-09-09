import assert from "node:assert/strict";
import test from "node:test";
import { WebhookDispatcher } from "../dist/index.js";
import { deriveWebhookSecret, verifyWebhook } from "@eventrail/platform";
function repo(job) {
  const calls = [];
  return {
    calls,
    async claim() {
      return [job];
    },
    async delivered(...args) {
      calls.push(["delivered", ...args]);
    },
    async retry(...args) {
      calls.push(["retry", ...args]);
    },
    async deadLetter(...args) {
      calls.push(["dead", ...args]);
    },
  };
}
const job = {
  id: "delivery",
  endpointId: "endpoint",
  integratorId: "integrator",
  url: "https://hooks.example.test",
  activeKeyId: "key",
  attempt: 1,
  envelope: { id: "evt", type: "fill.created", createdAt: "2026-01-01T00:00:00.000Z", data: { tx: "0x1" } },
};
test("delivery sends an idempotent id and verifiable signature", async () => {
  let headers;
  const repository = repo(job);
  const dispatcher = new WebhookDispatcher(repository, "master-key-long-enough", async (_url, init) => {
    headers = new Headers(init.headers);
    const body = String(init.body);
    assert.equal(headers.get("x-eventrail-id"), "evt");
    const signature = headers.get("x-eventrail-signature");
    const timestamp = Number(signature.match(/t=(\d+)/)[1]);
    const secret = deriveWebhookSecret("master-key-long-enough", "integrator", "endpoint", "key");
    assert.equal(verifyWebhook(secret, signature, body, timestamp), true);
    return new globalThis.Response(null, { status: 204 });
  });
  assert.deepEqual(await dispatcher.runBatch(), { delivered: 1, retried: 0, deadLettered: 0 });
  assert.equal(repository.calls[0][0], "delivered");
});
test("failures retry with backoff and eventually dead-letter", async () => {
  const retryRepo = repo(job);
  await new WebhookDispatcher(
    retryRepo,
    "master-key-long-enough",
    async () => new globalThis.Response(null, { status: 503 }),
  ).runBatch();
  assert.equal(retryRepo.calls[0][0], "retry");
  const deadRepo = repo({ ...job, attempt: 8 });
  await new WebhookDispatcher(
    deadRepo,
    "master-key-long-enough",
    async () => new globalThis.Response(null, { status: 503 }),
  ).runBatch();
  assert.equal(deadRepo.calls[0][0], "dead");
});
