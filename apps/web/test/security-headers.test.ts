import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("content security policy permits the hosted gateway", () => {
  const config = readFileSync(resolve(import.meta.dirname, "../next.config.ts"), "utf8");

  assert.match(config, /connect-src[^\n]+https:\/\/\*\.onrender\.com/);
});
