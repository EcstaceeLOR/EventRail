export type MarketPhase = "trading" | "paused" | "resolving" | "resolved" | "voided";

export interface EventMarket {
  id: string;
  slug: string;
  question: string;
  category: string;
  phase: MarketPhase;
  yesPrice: number;
  noPrice: number;
  volumeUsd: number;
  liquidityUsd: number;
  closesAt: string;
}

export interface TransactionPlan {
  chainId: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  summary: string;
  expiresAt: string;
}

export interface HealthStatus {
  status: "ok" | "degraded";
  service: string;
  version: string;
  timestamp: string;
}
