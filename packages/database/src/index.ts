import type { EventMarket } from "@eventrail/types";

export { createDatabasePool, withDatabaseTransaction } from "./pool.js";
export type { DatabasePool } from "./pool.js";
export { PostgresTradePlanStore, type PersistedTradePlan } from "./trade-plans.js";
export { PostgresTradeExecutionRepository } from "./trade-executions.js";
export { PostgresTradeActivityReader, type TradeActivityFilter } from "./trade-activity.js";
export {
  PostgresDreamDexMarketGenerationRepository,
  type DreamDexMarketGenerationRepository,
} from "./dreamdex-generations.js";

export interface MarketRepository {
  upsertMany(markets: readonly EventMarket[]): Promise<void>;
  findAll(): Promise<readonly EventMarket[]>;
  findById(marketId: string): Promise<EventMarket | null>;
}

export interface CheckpointRepository {
  read(worker: string): Promise<string | null>;
  write(worker: string, checkpoint: string): Promise<void>;
}
