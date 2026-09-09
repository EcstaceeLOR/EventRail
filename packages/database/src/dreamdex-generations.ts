import { NormalizedMarketSchema, type NormalizedMarket, type SomniaNetwork } from "@eventrail/types";
import type { DatabasePool } from "./pool.js";

export interface DreamDexMarketGenerationRepository {
  findGeneration(network: SomniaNetwork, marketId: string): Promise<NormalizedMarket | null>;
  upsertGeneration(market: NormalizedMarket): Promise<void>;
  findSeriesHead(network: SomniaNetwork, seriesKey: string): Promise<NormalizedMarket | null>;
  setSeriesHead(market: NormalizedMarket): Promise<void>;
}

export class PostgresDreamDexMarketGenerationRepository implements DreamDexMarketGenerationRepository {
  constructor(private readonly pool: DatabasePool) {}

  async findGeneration(network: SomniaNetwork, marketId: string): Promise<NormalizedMarket | null> {
    const result = await this.pool.query<{ snapshot: unknown }>(
      "SELECT snapshot FROM dreamdex_market_generations WHERE network = $1 AND market_id = $2",
      [network, marketId.toLowerCase()],
    );
    const row = result.rows[0];
    return row ? NormalizedMarketSchema.parse(row.snapshot) : null;
  }

  async upsertGeneration(market: NormalizedMarket): Promise<void> {
    await this.pool.query(
      `INSERT INTO dreamdex_market_generations
        (network, market_id, series_key, pool_address, pool_nonce, status, source_block,
         trading_start, expires_at, snapshot, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       ON CONFLICT (network, market_id) DO UPDATE SET
         series_key = EXCLUDED.series_key,
         pool_address = EXCLUDED.pool_address,
         pool_nonce = EXCLUDED.pool_nonce,
         status = EXCLUDED.status,
         source_block = EXCLUDED.source_block,
         trading_start = EXCLUDED.trading_start,
         expires_at = EXCLUDED.expires_at,
         snapshot = EXCLUDED.snapshot,
         observed_at = EXCLUDED.observed_at,
         updated_at = now()
       WHERE dreamdex_market_generations.source_block <= EXCLUDED.source_block`,
      [
        market.network,
        market.marketId.toLowerCase(),
        market.cadence.seriesKey,
        market.poolAddress.toLowerCase(),
        market.poolNonce,
        market.status,
        market.freshness.sourceBlock,
        market.tradingStart,
        market.expiresAt,
        JSON.stringify(market),
        market.freshness.observedAt,
      ],
    );
  }

  async findSeriesHead(network: SomniaNetwork, seriesKey: string): Promise<NormalizedMarket | null> {
    const result = await this.pool.query<{ snapshot: unknown }>(
      `SELECT generation.snapshot
       FROM dreamdex_series_heads head
       JOIN dreamdex_market_generations generation
         ON generation.network = head.network AND generation.market_id = head.market_id
       WHERE head.network = $1 AND head.series_key = $2`,
      [network, seriesKey],
    );
    const row = result.rows[0];
    return row ? NormalizedMarketSchema.parse(row.snapshot) : null;
  }

  async setSeriesHead(market: NormalizedMarket): Promise<void> {
    await this.pool.query(
      `INSERT INTO dreamdex_series_heads (network, series_key, market_id, source_block)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (network, series_key) DO UPDATE SET
         market_id = EXCLUDED.market_id,
         source_block = EXCLUDED.source_block,
         updated_at = now()
       WHERE dreamdex_series_heads.source_block <= EXCLUDED.source_block`,
      [market.network, market.cadence.seriesKey, market.marketId.toLowerCase(), market.freshness.sourceBlock],
    );
  }
}
