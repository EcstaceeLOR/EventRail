import { EventRailApiError } from "@eventrail/api-client";
import type { TradePlan, TradeQuote } from "@eventrail/types";

export interface TradeQuoteRequest {
  marketId: string;
  outcome: "up" | "down";
  side: "buy" | "sell";
  mode: "spend" | "quantity";
  amount: string;
  availableBalance?: string;
  feeBps?: number;
  maxSlippageBps?: number;
  minimumFillBps?: number;
  minimumTimeRemainingSeconds?: number;
}

interface TradePlanningClient {
  createTradeQuote(input: TradeQuoteRequest): Promise<TradeQuote>;
  createTradePlan(input: {
    account: `0x${string}`;
    idempotencyKey: string;
    quote: TradeQuote;
    policy: {
      maxSlippageBps: number;
      minimumFillBps: number;
      minimumTimeRemainingSeconds: number;
      quoteSourceBlock: string;
      quoteExpiresAt: string;
    };
  }): Promise<TradePlan>;
}

interface PrepareExecutableTradeInput {
  account: `0x${string}`;
  quote: TradeQuoteRequest;
  policy: {
    maxSlippageBps: number;
    minimumFillBps: number;
    minimumTimeRemainingSeconds: number;
  };
}

interface PrepareExecutableTradeOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
  idempotencyKey?: () => string;
}

/**
 * Quote and plan are separate authoritative reads. If DreamDEX depth changes
 * between them, request a new pair instead of surfacing a recoverable race to
 * the trader.
 */
export async function prepareExecutableTrade(
  client: TradePlanningClient,
  input: PrepareExecutableTradeInput,
  options: PrepareExecutableTradeOptions = {},
): Promise<{ quote: TradeQuote; plan: TradePlan }> {
  const maxAttempts = options.maxAttempts ?? 4;
  const retryDelayMs = options.retryDelayMs ?? 75;
  const delay =
    options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const idempotencyKey = options.idempotencyKey ?? (() => globalThis.crypto.randomUUID());
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const quote = await client.createTradeQuote(input.quote);
      const plan = await client.createTradePlan({
        account: input.account,
        idempotencyKey: idempotencyKey(),
        quote,
        policy: {
          ...input.policy,
          quoteSourceBlock: quote.sourceBlock,
          quoteExpiresAt: quote.expiresAt,
        },
      });
      return { quote, plan };
    } catch (error) {
      lastError = error;
      if (!isRecoverableStaleBook(error) || attempt === maxAttempts - 1) throw error;
      await delay(retryDelayMs * 2 ** attempt);
    }
  }

  throw lastError;
}

/** A fresh order may proceed without another review only on identical or better terms. */
export function isNoWorseThanReviewed(reviewed: TradeQuote, fresh: TradeQuote): boolean {
  if (
    reviewed.network !== fresh.network ||
    reviewed.marketId !== fresh.marketId ||
    reviewed.poolAddress.toLowerCase() !== fresh.poolAddress.toLowerCase() ||
    reviewed.outcome !== fresh.outcome ||
    reviewed.side !== fresh.side ||
    reviewed.mode !== fresh.mode ||
    reviewed.requestedAmount !== fresh.requestedAmount
  ) {
    return false;
  }

  if (fresh.side === "buy") {
    return (
      BigInt(fresh.limitPrice) <= BigInt(reviewed.limitPrice) &&
      BigInt(fresh.maximumCost) <= BigInt(reviewed.maximumCost) &&
      BigInt(fresh.quantity) >= BigInt(reviewed.quantity)
    );
  }

  return (
    BigInt(fresh.limitPrice) >= BigInt(reviewed.limitPrice) &&
    BigInt(fresh.minimumReceive) >= BigInt(reviewed.minimumReceive) &&
    BigInt(fresh.quantity) >= BigInt(reviewed.quantity)
  );
}

export function isRecoverableStaleBook(error: unknown): boolean {
  if (!(error instanceof EventRailApiError) || typeof error.body !== "object" || error.body === null) {
    return false;
  }
  const bodyError = "error" in error.body ? (error.body as { error?: unknown }).error : undefined;
  if (typeof bodyError !== "object" || bodyError === null) return false;
  const details = bodyError as { code?: unknown; recoverable?: unknown };
  return details.code === "STALE_BOOK" && details.recoverable === true;
}
