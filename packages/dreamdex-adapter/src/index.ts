import type { EventMarket, TransactionPlan } from "@eventrail/types";

export interface DreamDexReadAdapter {
  listMarkets(signal?: AbortSignal): Promise<readonly EventMarket[]>;
  getMarket(marketId: string, signal?: AbortSignal): Promise<EventMarket | null>;
}

export interface DreamDexTransactionAdapter {
  planTrade(input: {
    marketId: string;
    outcome: "yes" | "no";
    amountUsdso: string;
    account: `0x${string}`;
  }): Promise<TransactionPlan>;
}

export const SOMNIA_SHANNON_CHAIN_ID = 50_312;
