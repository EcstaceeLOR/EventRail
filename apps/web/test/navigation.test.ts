import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const appRoot = resolve(import.meta.dirname, "../app");
const routes = [
  "page.tsx",
  "markets/page.tsx",
  "portfolio/page.tsx",
  "claims/page.tsx",
  "developers/page.tsx",
  "developers/dashboard/page.tsx",
  "developers/design-system/page.tsx",
  "settings/page.tsx",
  "status/page.tsx",
];

test("every shell destination has a page and recovery boundary", () => {
  for (const route of routes) assert.equal(existsSync(resolve(appRoot, route)), true, route);
  assert.equal(existsSync(resolve(appRoot, "loading.tsx")), true);
  assert.equal(existsSync(resolve(appRoot, "error.tsx")), true);

  const shell = readFileSync(resolve(import.meta.dirname, "../components/app-shell.tsx"), "utf8");
  for (const href of ["/markets", "/portfolio", "/claims", "/developers", "/settings", "/status"]) {
    assert.ok(shell.includes(`href: "${href}"`) || shell.includes(`href="${href}"`), href);
  }
});
