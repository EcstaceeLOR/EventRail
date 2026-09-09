import type { TradePlan } from "@eventrail/types";

export type TradeIntentStage = "quote" | "approval" | "wallet_confirmation" | "submitted";

export interface MarketGenerationState {
  marketId: string;
  poolAddress: string;
  status: string;
  successorMarketId?: string | null;
}

export interface RolloverDecision {
  valid: boolean;
  reason: string | null;
  successorMarketId: string | null;
  trackSubmittedTransaction: boolean;
}

/**
 * Pure guard shared by UI and workers. A plan can never migrate to a successor market:
 * a generation change invalidates every pre-broadcast stage, while an already-submitted
 * transaction remains attached to its immutable market and is only tracked to completion.
 */
export function assessRollover(
  plan: Pick<TradePlan, "marketId" | "poolAddress">,
  stage: TradeIntentStage,
  market: MarketGenerationState,
): RolloverDecision {
  const changed =
    market.marketId.toLowerCase() !== plan.marketId.toLowerCase() ||
    market.poolAddress.toLowerCase() !== plan.poolAddress.toLowerCase();
  const closed = market.status !== "trading";
  if (!changed && !closed) {
    return { valid: true, reason: null, successorMarketId: null, trackSubmittedTransaction: false };
  }
  const successorMarketId = market.successorMarketId ?? (changed ? market.marketId : null);
  if (stage === "submitted") {
    return {
      valid: true,
      reason: "The market rolled after broadcast; the submitted transaction remains bound to the old market.",
      successorMarketId,
      trackSubmittedTransaction: true,
    };
  }
  return {
    valid: false,
    reason: "This market generation rolled over. The old quote and transaction plan were cleared.",
    successorMarketId,
    trackSubmittedTransaction: false,
  };
}
