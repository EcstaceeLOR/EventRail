import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../../.github/workflows/smoke.yml", import.meta.url), "utf8");

test("production smoke incidents follow the probe state", () => {
  assert.match(workflow, /Open public incident on failure[\s\S]*if: failure\(\)/);
  assert.match(workflow, /Resolve recovered smoke incidents[\s\S]*if: success\(\)/);
  assert.match(workflow, /gh issue comment[\s\S]*Resolved automatically/);
  assert.match(workflow, /gh issue close[\s\S]*--reason completed/);
});
