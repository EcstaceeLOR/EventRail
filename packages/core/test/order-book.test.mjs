import assert from "node:assert/strict";
import test from "node:test";
import { OrderBookIntegrityError, normalizeComplementaryBook, quoteExecutableDepth } from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const address = `0x${"11".repeat(20)}`;

function book(upBids = [], upAsks = []) {
  return {
    network: "shannon",
    venue: "dreamdex",
    marketId,
    poolAddress: address,
    collateralDecimals: 6,
    upBids,
    upAsks,
    downBids: [],
    downAsks: [],
    freshness: {
      sourceBlock: "100",
      observedAt: "2026-09-09T10:00:00.000Z",
      staleAt: "2026-09-09T10:00:10.000Z",
      authoritative: true,
      state: "fresh",
    },
  };
}

test("UP and DOWN books remain exactly complementary across generated levels", () => {
  for (let price = 1; price < 1_000_000; price += 7_919) {
    const normalized = normalizeComplementaryBook(
      book([{ price: price.toString(), quantity: "3" }], [{ price: (price + 1).toString(), quantity: "4" }]),
    );
    assert.equal(BigInt(normalized.upBids[0].price) + BigInt(normalized.downAsks[0].price), 1_000_000n);
    assert.equal(BigInt(normalized.upAsks[0].price) + BigInt(normalized.downBids[0].price), 1_000_000n);
  }
});

test("empty depth produces an incomplete quote without fabricated prices", () => {
  const quote = quoteExecutableDepth(book(), { outcome: "up", side: "buy", quantity: "10" });
  assert.equal(quote.complete, false);
  assert.equal(quote.filledQuantity, "0");
  assert.equal(quote.averagePrice, null);
  assert.equal(quote.spread, null);
});

test("thin depth reports partial execution and minimum fill", () => {
  const quote = quoteExecutableDepth(book([], [{ price: "600000", quantity: "4" }]), {
    outcome: "up",
    side: "buy",
    quantity: "10",
    minimumFillBps: 9_000,
  });
  assert.equal(quote.filledQuantity, "4");
  assert.equal(quote.minimumFillQuantity, "3");
  assert.equal(quote.complete, false);
});

test("multi-level depth computes exact average, worst price, spread, and impact", () => {
  const quote = quoteExecutableDepth(
    book(
      [{ price: "500000", quantity: "1000000" }],
      [
        { price: "600000", quantity: "1000000" },
        { price: "700000", quantity: "1000000" },
      ],
    ),
    { outcome: "up", side: "buy", quantity: "1500000" },
  );
  assert.equal(quote.quoteQuantity, "950000");
  assert.equal(quote.averagePrice, "633333");
  assert.equal(quote.worstPrice, "700000");
  assert.equal(quote.spread, "100000");
  assert.equal(quote.priceImpactBps, "555");
  assert.equal(quote.complete, true);
});

test("crossed books fail closed", () => {
  assert.throws(
    () =>
      quoteExecutableDepth(book([{ price: "600000", quantity: "1" }], [{ price: "590000", quantity: "1" }]), {
        outcome: "up",
        side: "buy",
        quantity: "1",
      }),
    (error) => error instanceof OrderBookIntegrityError && error.code === "CROSSED_BOOK",
  );
});
