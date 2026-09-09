import assert from "node:assert/strict";
import test from "node:test";
import { contentViolations, pathViolation } from "../repository-policy.mjs";

test("repository path policy rejects generated and sensitive files", () => {
  assert.equal(pathViolation("apps/web/.next/server.js"), "generated build output");
  assert.equal(pathViolation("packages/core/dist/index.js"), "generated build output");
  assert.equal(pathViolation(".env.production"), "sensitive environment file");
  assert.equal(pathViolation(".env.example"), null);
  assert.equal(pathViolation("packages/core/src/index.ts"), null);
});

test("repository content policy detects representative secret forms", () => {
  const fakeAssignment = ["PRIVATE", "KEY"].join("_") + '="' + "intentional-fake-value-12345" + '"';
  assert.deepEqual(contentViolations(fakeAssignment), ["assigned secret"]);
  assert.deepEqual(contentViolations("export const chainId = 50312;"), []);
});
