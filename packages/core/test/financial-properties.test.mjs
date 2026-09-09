import assert from "node:assert/strict";
import test from "node:test";
import { normalizeComplementaryBook, quoteExecutableDepth } from "../dist/index.js";

const marketId = `0x${"ab".repeat(32)}`;
const poolAddress = `0x${"11".repeat(20)}`;

function sample(seed) {
  let state = BigInt(seed);
  return () => {
    state = (state * 48271n) % 2147483647n;
    return Number(state);
  };
}

function book(bids, asks) {
  return {
    network: "shannon",
    venue: "dreamdex",
    marketId,
    poolAddress,
    collateralDecimals: 6,
    upBids: bids,
    upAsks: asks,
    downBids: [],
    downAsks: [],
    freshness: {
      sourceBlock: "9007199254740993",
      observedAt: "2026-09-09T10:00:00.000Z",
      staleAt: "2026-09-09T10:00:10.000Z",
      authoritative: true,
      state: "fresh",
    },
  };
}

test("property: complementary prices and aggregate quantity are conserved", () => {
  const random = sample(7);
  for (let index = 0; index < 1_000; index += 1) {
    const bid = 1 + (random() % 499_998);
    const ask = 500_001 + (random() % 499_998);
    const first = 1 + (random() % 1_000_000);
    const second = 1 + (random() % 1_000_000);
    const normalized = normalizeComplementaryBook(
      book(
        [
          { price: String(bid), quantity: String(first) },
          { price: String(bid), quantity: String(second) },
        ],
        [{ price: String(ask), quantity: String(first) }],
      ),
    );
    assert.equal(BigInt(normalized.upBids[0].price) + BigInt(normalized.downAsks[0].price), 1_000_000n);
    assert.equal(BigInt(normalized.upAsks[0].price) + BigInt(normalized.downBids[0].price), 1_000_000n);
    assert.equal(normalized.upBids[0].quantity, String(first + second));
  }
});

test("property: depth walking never fills or charges beyond available liquidity", () => {
  const random = sample(19);
  for (let index = 0; index < 1_000; index += 1) {
    const price = 500_001 + (random() % 499_998);
    const available = 1 + (random() % 10_000_000);
    const requested = 1 + (random() % 20_000_000);
    const quote = quoteExecutableDepth(book([], [{ price: String(price), quantity: String(available) }]), {
      outcome: "up",
      side: "buy",
      quantity: String(requested),
    });
    assert.ok(BigInt(quote.filledQuantity) <= BigInt(quote.requestedQuantity));
    assert.ok(BigInt(quote.filledQuantity) <= BigInt(quote.availableQuantity));
    assert.ok(BigInt(quote.quoteQuantity) <= BigInt(quote.filledQuantity));
    assert.equal(quote.complete, requested <= available);
  }
});
