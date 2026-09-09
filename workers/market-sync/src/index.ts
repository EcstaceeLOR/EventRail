export const workerName = "market-sync";

export interface MarketSyncRun {
  startedAt: string;
  discovered: number;
  updated: number;
  checkpoint: string;
}
