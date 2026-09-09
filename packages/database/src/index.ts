import type { EventMarket } from "@eventrail/types";

export interface MarketRepository {
  upsertMany(markets: readonly EventMarket[]): Promise<void>;
  findAll(): Promise<readonly EventMarket[]>;
  findById(marketId: string): Promise<EventMarket | null>;
}

export interface CheckpointRepository {
  read(worker: string): Promise<string | null>;
  write(worker: string, checkpoint: string): Promise<void>;
}
