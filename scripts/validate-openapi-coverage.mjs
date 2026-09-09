import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const [gateway, spec, generated] = await Promise.all([
  readFile(new URL("../apps/gateway/src/app.ts", import.meta.url), "utf8"),
  readFile(new URL("../openapi/eventrail.v1.yaml", import.meta.url), "utf8"),
  readFile(new URL("../packages/api-client/src/generated.ts", import.meta.url), "utf8"),
]);
const routePattern = /app\.(?:get|post|put|delete)\("(\/v1\/[^"?]+)"/g;
const routes = [...gateway.matchAll(routePattern)].map((match) => match[1].replace(/:([A-Za-z]+)/g, "{$1}"));
for (const route of routes) {
  assert.match(
    spec,
    new RegExp(`^  ${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`, "m"),
    `OpenAPI is missing ${route}`,
  );
  assert.ok(generated.includes(`"${route}"`), `Generated client paths are missing ${route}`);
}
console.log(`OpenAPI covers all ${routes.length} gateway operations across ${new Set(routes).size} paths.`);
