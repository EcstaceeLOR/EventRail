import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const blueprint = await readFile(new URL("../../render.yaml", import.meta.url), "utf8");

test("Render probes process liveness without coupling restarts to free-tier datastores", () => {
  assert.match(blueprint, /healthCheckPath: \/v1\/health/);
  assert.doesNotMatch(blueprint, /healthCheckPath: \/v1\/ready/);
});
