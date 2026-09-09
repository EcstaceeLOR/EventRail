import assert from "node:assert/strict";
import test from "node:test";
import { assessRollover } from "../dist/index.js";

const oldMarket = `0x${"11".repeat(32)}`;
const newMarket = `0x${"22".repeat(32)}`;
const pool = `0x${"33".repeat(20)}`;
const plan = { marketId: oldMarket, poolAddress: pool };

for (const stage of ["quote", "approval", "wallet_confirmation"]) {
  test(`invalidates the old plan during ${stage}`, () => {
    const result = assessRollover(plan, stage, {
      marketId: newMarket,
      poolAddress: pool,
      status: "trading",
      successorMarketId: newMarket,
    });
    assert.equal(result.valid, false);
    assert.equal(result.successorMarketId, newMarket);
  });
}

test("tracks a broadcast transaction against the immutable old generation", () => {
  const result = assessRollover(plan, "submitted", {
    marketId: oldMarket,
    poolAddress: pool,
    status: "settling",
    successorMarketId: newMarket,
  });
  assert.equal(result.valid, true);
  assert.equal(result.trackSubmittedTransaction, true);
});
