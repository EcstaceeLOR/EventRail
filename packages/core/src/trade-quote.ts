import {
  NormalizedMarketSchema,
  NormalizedOrderBookSchema,
  TradeQuoteSchema,
  type NormalizedMarket,
  type NormalizedOrderBook,
  type TradeQuote,
} from "@eventrail/types";
import { normalizeComplementaryBook } from "./order-book.js";

export type QuoteErrorCode =
  | "EMPTY_BOOK"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_LIQUIDITY"
  | "INVALID_INPUT"
  | "MARKET_NOT_TRADING"
  | "MARKET_TOO_CLOSE_TO_EXPIRY"
  | "MINIMUM_NOT_MET"
  | "STALE_BOOK";

export class QuoteError extends Error {
  constructor(
    readonly code: QuoteErrorCode,
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
    this.name = "QuoteError";
  }
}

export interface TradeQuoteInput {
  outcome: "up" | "down";
  side: "buy" | "sell";
  mode: "spend" | "quantity";
  amount: string;
  tickSize: string;
  lotSize: string;
  minimumQuantity: string;
  feeBps?: number;
  maxSlippageBps?: number;
  minimumFillBps?: number;
  minimumTimeRemainingSeconds?: number;
  quoteTtlMs?: number;
  collateralBalance?: string;
  outcomeBalance?: string;
  now?: Date;
}

/**
 * Produces a conservative, directly executable quote using integer arithmetic only.
 * The returned price is snapped away from the user (up for buys, down for sells),
 * while quantity is always snapped down to the live lot size.
 */
export function calculateTradeQuote(
  marketInput: NormalizedMarket,
  bookInput: NormalizedOrderBook,
  input: TradeQuoteInput,
): TradeQuote {
  const market = NormalizedMarketSchema.parse(marketInput);
  const book = normalizeComplementaryBook(NormalizedOrderBookSchema.parse(bookInput));
  const now = input.now ?? new Date();
  const amount = positive(input.amount, "amount");
  const tick = positive(input.tickSize, "tickSize");
  const lot = positive(input.lotSize, "lotSize");
  const minimumQuantity = positive(input.minimumQuantity, "minimumQuantity");
  const feeBps = bps(input.feeBps ?? 0, "feeBps");
  const maxSlippageBps = bps(input.maxSlippageBps ?? 100, "maxSlippageBps");
  const minimumFillBps = bps(input.minimumFillBps ?? 10_000, "minimumFillBps");
  const minimumTimeMs = (input.minimumTimeRemainingSeconds ?? 30) * 1_000;
  const quoteTtlMs = input.quoteTtlMs ?? 8_000;

  if (market.marketId !== book.marketId || market.poolAddress !== book.poolAddress) {
    throw new QuoteError("INVALID_INPUT", "The order book is not bound to this market generation.", false);
  }
  if (market.status !== "trading") {
    throw new QuoteError("MARKET_NOT_TRADING", "This market is no longer accepting trades.", true);
  }
  if (!book.freshness.authoritative || book.freshness.state !== "fresh") {
    throw new QuoteError("STALE_BOOK", "Live liquidity is stale. Refresh the quote before trading.", true);
  }
  const marketExpiryMs = Date.parse(market.expiresAt);
  if (marketExpiryMs - now.getTime() < minimumTimeMs) {
    throw new QuoteError(
      "MARKET_TOO_CLOSE_TO_EXPIRY",
      "This market is too close to lock. Open its successor before trading.",
      true,
    );
  }
  if (input.mode === "spend" && input.side !== "buy") {
    throw new QuoteError("INVALID_INPUT", "Spend mode is only available when buying an outcome.", false);
  }

  const levels = selectLevels(book, input.outcome, input.side);
  if (!levels[0]) {
    throw new QuoteError("EMPTY_BOOK", "No executable liquidity is available for this outcome.", true);
  }
  const one = 10n ** BigInt(book.collateralDecimals);
  const bestPrice = BigInt(levels[0].price);
  const unsnappedLimit =
    input.side === "buy"
      ? ceilDiv(bestPrice * BigInt(10_000 + maxSlippageBps), 10_000n)
      : (bestPrice * BigInt(10_000 - maxSlippageBps)) / 10_000n;
  const limitPrice =
    input.side === "buy"
      ? min(snapPrice(unsnappedLimit, tick, input.side), one)
      : snapPrice(unsnappedLimit, tick, input.side) === 0n
        ? tick
        : snapPrice(unsnappedLimit, tick, input.side);
  const availableQuantity = levels.reduce((sum, level) => sum + BigInt(level.quantity), 0n);

  const requestedQuantity =
    input.mode === "quantity"
      ? snapDown(amount, lot)
      : snapDown((amount * one * 10_000n) / (limitPrice * BigInt(10_000 + feeBps)), lot);
  let remainingQuantity = requestedQuantity;
  if (requestedQuantity < minimumQuantity) {
    throw new QuoteError("MINIMUM_NOT_MET", "Quantity is below the live market minimum.", false);
  }

  let quantity = 0n;
  let notional = 0n;
  let worstPrice = bestPrice;
  for (const level of levels) {
    const price = BigInt(level.price);
    if ((input.side === "buy" && price > limitPrice) || (input.side === "sell" && price < limitPrice)) break;
    const levelQuantity = snapDown(BigInt(level.quantity), lot);
    if (levelQuantity === 0n) continue;
    const take = snapDown(min(levelQuantity, remainingQuantity), lot);
    if (take === 0n) break;
    const levelNotional = input.side === "buy" ? ceilDiv(take * price, one) : (take * price) / one;
    quantity += take;
    notional += levelNotional;
    worstPrice = price;
    remainingQuantity -= take;
  }

  if (quantity < minimumQuantity) {
    throw new QuoteError(
      "INSUFFICIENT_LIQUIDITY",
      "Available liquidity cannot satisfy the market minimum at your slippage limit.",
      true,
    );
  }
  const minimumFillQuantity = snapUp(ceilDiv(requestedQuantity * BigInt(minimumFillBps), 10_000n), lot);
  if (quantity < minimumFillQuantity) {
    throw new QuoteError(
      "INSUFFICIENT_LIQUIDITY",
      "Available liquidity cannot meet your minimum-fill requirement.",
      true,
    );
  }

  const fee = ceilDiv(notional * BigInt(feeBps), 10_000n);
  const total = input.side === "buy" ? notional + fee : notional > fee ? notional - fee : 0n;
  const worstNotional =
    input.side === "buy" ? ceilDiv(limitPrice * quantity, one) : (limitPrice * quantity) / one;
  const worstFee = ceilDiv(worstNotional * BigInt(feeBps), 10_000n);
  const maximumCost = input.side === "buy" ? worstNotional + worstFee : 0n;
  const minimumReceive = input.side === "sell" && worstNotional > worstFee ? worstNotional - worstFee : 0n;
  const requiredBalance = input.side === "buy" ? maximumCost : quantity;
  const balanceValue = input.side === "buy" ? input.collateralBalance : input.outcomeBalance;
  if (balanceValue !== undefined && BigInt(balanceValue) < requiredBalance) {
    throw new QuoteError(
      "INSUFFICIENT_BALANCE",
      input.side === "buy"
        ? "Your USDso balance is below the maximum trade cost."
        : "Your outcome-token balance is below the sell quantity.",
      true,
    );
  }

  const averagePrice = input.side === "buy" ? ceilDiv(notional * one, quantity) : (notional * one) / quantity;
  const priceImpactBps =
    input.side === "buy"
      ? ((averagePrice - bestPrice) * 10_000n) / bestPrice
      : ((bestPrice - averagePrice) * 10_000n) / bestPrice;
  const bids = input.outcome === "up" ? book.upBids : book.downBids;
  const asks = input.outcome === "up" ? book.upAsks : book.downAsks;
  const spread = bids[0] && asks[0] ? BigInt(asks[0].price) - BigInt(bids[0].price) : null;
  const hardExpiryMs = Math.min(
    now.getTime() + quoteTtlMs,
    Date.parse(book.freshness.staleAt),
    marketExpiryMs - minimumTimeMs,
  );
  if (hardExpiryMs <= now.getTime()) {
    throw new QuoteError("STALE_BOOK", "The quote expired before it could be presented.", true);
  }

  return TradeQuoteSchema.parse({
    version: "1",
    network: market.network,
    venue: "dreamdex",
    marketId: market.marketId,
    poolAddress: market.poolAddress,
    collateralDecimals: market.collateralDecimals,
    outcome: input.outcome,
    side: input.side,
    mode: input.mode,
    requestedAmount: amount.toString(),
    quantity: quantity.toString(),
    availableQuantity: availableQuantity.toString(),
    minimumFillQuantity: minimumFillQuantity.toString(),
    notional: notional.toString(),
    fee: fee.toString(),
    total: total.toString(),
    maximumCost: maximumCost.toString(),
    minimumReceive: minimumReceive.toString(),
    averagePrice: averagePrice.toString(),
    worstPrice: worstPrice.toString(),
    limitPrice: limitPrice.toString(),
    priceImpactBps: priceImpactBps.toString(),
    spread: spread?.toString() ?? null,
    tickSize: tick.toString(),
    lotSize: lot.toString(),
    sourceBlock: book.freshness.sourceBlock,
    observedAt: book.freshness.observedAt,
    expiresAt: new Date(hardExpiryMs).toISOString(),
    marketExpiresAt: market.expiresAt,
    warnings: priceImpactBps >= 50n ? ["This order crosses multiple price levels."] : [],
  });
}

function selectLevels(book: NormalizedOrderBook, outcome: "up" | "down", side: "buy" | "sell") {
  if (outcome === "up") return side === "buy" ? book.upAsks : book.upBids;
  return side === "buy" ? book.downAsks : book.downBids;
}

function positive(value: string, name: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new QuoteError("INVALID_INPUT", `${name} must be a positive integer string.`, false);
  }
  return BigInt(value);
}

function bps(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new QuoteError("INVALID_INPUT", `${name} must be an integer from 0 to 10000.`, false);
  }
  return value;
}

function min(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function ceilDiv(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

function snapDown(value: bigint, increment: bigint): bigint {
  return (value / increment) * increment;
}

function snapUp(value: bigint, increment: bigint): bigint {
  return ceilDiv(value, increment) * increment;
}

function snapPrice(value: bigint, tick: bigint, side: "buy" | "sell"): bigint {
  return side === "buy" ? snapUp(value, tick) : snapDown(value, tick);
}
