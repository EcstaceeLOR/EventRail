import {
  ExecutableQuoteSchema,
  NormalizedOrderBookSchema,
  type ExecutableQuote,
  type NormalizedOrderBook,
} from "@eventrail/types";

export interface QuoteDepthInput {
  outcome: "up" | "down";
  side: "buy" | "sell";
  quantity: string;
  minimumFillBps?: number;
}

export class OrderBookIntegrityError extends Error {
  constructor(
    readonly code: "INVALID_LEVEL" | "CROSSED_BOOK",
    message: string,
  ) {
    super(message);
    this.name = "OrderBookIntegrityError";
  }
}

export function normalizeComplementaryBook(input: NormalizedOrderBook): NormalizedOrderBook {
  const parsed = NormalizedOrderBookSchema.parse(input);
  const one = 10n ** BigInt(parsed.collateralDecimals);
  const upBids = aggregateLevels(parsed.upBids, "desc", one);
  const upAsks = aggregateLevels(parsed.upAsks, "asc", one);
  assertNotCrossed(upBids, upAsks);
  const downBids = upAsks
    .map((level) => ({ price: (one - BigInt(level.price)).toString(), quantity: level.quantity }))
    .sort(comparePrice("desc"));
  const downAsks = upBids
    .map((level) => ({ price: (one - BigInt(level.price)).toString(), quantity: level.quantity }))
    .sort(comparePrice("asc"));
  return NormalizedOrderBookSchema.parse({ ...parsed, upBids, upAsks, downBids, downAsks });
}

export function quoteExecutableDepth(
  bookInput: NormalizedOrderBook,
  input: QuoteDepthInput,
): ExecutableQuote {
  const book = normalizeComplementaryBook(bookInput);
  const requested = parsePositiveInteger(input.quantity, "quantity");
  const minimumFillBps = input.minimumFillBps ?? 10_000;
  if (!Number.isInteger(minimumFillBps) || minimumFillBps < 0 || minimumFillBps > 10_000) {
    throw new RangeError("minimumFillBps must be an integer between 0 and 10000");
  }
  const levels = selectLevels(book, input.outcome, input.side);
  const available = levels.reduce((total, level) => total + BigInt(level.quantity), 0n);
  const one = 10n ** BigInt(book.collateralDecimals);
  let remaining = requested;
  let filled = 0n;
  let quoteNumerator = 0n;
  let worstPrice: bigint | null = null;

  for (const level of levels) {
    if (remaining === 0n) break;
    const levelQuantity = BigInt(level.quantity);
    const take = remaining < levelQuantity ? remaining : levelQuantity;
    const price = BigInt(level.price);
    filled += take;
    quoteNumerator += take * price;
    remaining -= take;
    worstPrice = price;
  }

  const quote = quoteNumerator / one;
  const averagePrice = filled === 0n ? null : quoteNumerator / filled;
  const bestPrice = levels[0] ? BigInt(levels[0].price) : null;
  const priceImpactBps =
    averagePrice === null || bestPrice === null || bestPrice === 0n
      ? null
      : input.side === "buy"
        ? ((averagePrice - bestPrice) * 10_000n) / bestPrice
        : ((bestPrice - averagePrice) * 10_000n) / bestPrice;
  const bids = input.outcome === "up" ? book.upBids : book.downBids;
  const asks = input.outcome === "up" ? book.upAsks : book.downAsks;
  const spread = bids[0] && asks[0] ? BigInt(asks[0].price) - BigInt(bids[0].price) : null;

  return ExecutableQuoteSchema.parse({
    marketId: book.marketId,
    outcome: input.outcome,
    side: input.side,
    requestedQuantity: requested.toString(),
    filledQuantity: filled.toString(),
    availableQuantity: available.toString(),
    minimumFillQuantity: ((filled * BigInt(minimumFillBps)) / 10_000n).toString(),
    quoteQuantity: quote.toString(),
    averagePrice: averagePrice?.toString() ?? null,
    worstPrice: worstPrice?.toString() ?? null,
    priceImpactBps: priceImpactBps?.toString() ?? null,
    spread: spread?.toString() ?? null,
    complete: filled === requested,
    freshness: book.freshness,
  });
}

function aggregateLevels(
  levels: NormalizedOrderBook["upBids"],
  order: "asc" | "desc",
  one: bigint,
): NormalizedOrderBook["upBids"] {
  const quantities = new Map<bigint, bigint>();
  for (const level of levels) {
    const price = BigInt(level.price);
    const quantity = BigInt(level.quantity);
    if (price < 0n || price > one || quantity <= 0n) {
      throw new OrderBookIntegrityError(
        "INVALID_LEVEL",
        `Invalid order-book level ${level.price}@${level.quantity}`,
      );
    }
    quantities.set(price, (quantities.get(price) ?? 0n) + quantity);
  }
  return [...quantities.entries()]
    .map(([price, quantity]) => ({ price: price.toString(), quantity: quantity.toString() }))
    .sort(comparePrice(order));
}

function comparePrice(order: "asc" | "desc") {
  return (left: { price: string }, right: { price: string }) => {
    const a = BigInt(left.price);
    const b = BigInt(right.price);
    if (a === b) return 0;
    return order === "asc" ? (a < b ? -1 : 1) : a > b ? -1 : 1;
  };
}

function assertNotCrossed(bids: NormalizedOrderBook["upBids"], asks: NormalizedOrderBook["upAsks"]): void {
  const bestBid = bids[0];
  const bestAsk = asks[0];
  if (bestBid && bestAsk && BigInt(bestBid.price) >= BigInt(bestAsk.price)) {
    throw new OrderBookIntegrityError(
      "CROSSED_BOOK",
      `Crossed UP book: ${bestBid.price} >= ${bestAsk.price}`,
    );
  }
}

function selectLevels(
  book: NormalizedOrderBook,
  outcome: QuoteDepthInput["outcome"],
  side: QuoteDepthInput["side"],
) {
  if (outcome === "up") return side === "buy" ? book.upAsks : book.upBids;
  return side === "buy" ? book.downAsks : book.downBids;
}

function parsePositiveInteger(value: string, name: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new RangeError(`${name} must be a positive integer string`);
  return BigInt(value);
}
