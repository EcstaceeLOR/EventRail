import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("trade review stays open while execution refreshes short-lived quotes", async () => {
  const source = await readFile(new URL("../components/trade-ticket.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Quote expired\. Review the refreshed market/);
  assert.doesNotMatch(source, /setInterval\(update, 250\)/);
  assert.match(source, /fresh quote checked again before signing/);
  assert.match(source, /prepareExecutableTrade/);
});
