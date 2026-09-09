import assert from "node:assert/strict";
import test from "node:test";
import { createGateway } from "../dist/app.js";

test("health route exposes a safe operational payload", async () => {
  const app = createGateway();
  const response = await app.inject({ method: "GET", url: "/v1/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "ok");
  assert.equal(response.json().service, "eventrail-gateway");
  await app.close();
});

test("unknown routes return a standard 404", async () => {
  const app = createGateway();
  const response = await app.inject({ method: "GET", url: "/private-key" });
  assert.equal(response.statusCode, 404);
  await app.close();
});
