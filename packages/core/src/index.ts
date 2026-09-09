import type { EventMarket } from "@eventrail/types";

export * from "./order-book.js";
export * from "./trade-quote.js";
export * from "./position-valuation.js";

export function impliedProbability(price: number): number {
  if (!Number.isFinite(price)) return 0;
  return Math.min(1, Math.max(0, price));
}

export function isMarketTradable(market: EventMarket, now = new Date()): boolean {
  return market.phase === "trading" && new Date(market.closesAt).getTime() > now.getTime();
}
