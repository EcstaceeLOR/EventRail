import {
  PortfolioPositionSchema,
  PortfolioSnapshotSchema,
  type PortfolioPosition,
  type PortfolioSnapshot,
  type SomniaNetwork,
} from "@eventrail/types";
import { withDatabaseTransaction, type DatabasePool } from "./pool.js";

export class PostgresPortfolioRepository {
  constructor(private readonly pool: DatabasePool) {}

  async reconcile(
    network: SomniaNetwork,
    account: string,
    snapshotInput: PortfolioSnapshot,
  ): Promise<readonly PortfolioPosition[]> {
    const snapshot = PortfolioSnapshotSchema.parse(snapshotInput);
    const positions = snapshot.positions;
    const sourceBlock = BigInt(snapshot.freshness.sourceBlock);
    const observedAt = snapshot.freshness.observedAt;
    await withDatabaseTransaction(this.pool, async (client) => {
      for (const position of positions) {
        await client.query(
          `INSERT INTO portfolio_positions
            (network, account_address, market_id, outcome, outcome_token_address, token_id,
             source_block, snapshot, active, observed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,true,$9)
           ON CONFLICT (network, account_address, market_id, outcome) DO UPDATE SET
             outcome_token_address = EXCLUDED.outcome_token_address,
             token_id = EXCLUDED.token_id,
             source_block = EXCLUDED.source_block,
             snapshot = EXCLUDED.snapshot,
             active = true,
             observed_at = EXCLUDED.observed_at,
             updated_at = now()
           WHERE portfolio_positions.source_block <= EXCLUDED.source_block`,
          [
            network,
            account.toLowerCase(),
            position.marketId.toLowerCase(),
            position.outcome,
            position.outcomeTokenAddress.toLowerCase(),
            position.tokenId,
            position.freshness.sourceBlock,
            JSON.stringify(position),
            position.freshness.observedAt,
          ],
        );
      }
      const activeKeys = positions.map(
        (position) => `${position.marketId.toLowerCase()}:${position.outcome}`,
      );
      await client.query(
        `UPDATE portfolio_positions SET active = false, updated_at = now()
         WHERE network = $1 AND account_address = $2 AND source_block <= $3
           AND NOT ((market_id || ':' || outcome) = ANY($4::text[]))`,
        [network, account.toLowerCase(), sourceBlock.toString(), activeKeys],
      );
      await client.query(
        `INSERT INTO portfolio_scan_checkpoints (network, account_address, source_block, observed_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (network, account_address) DO UPDATE SET
           source_block = EXCLUDED.source_block, observed_at = EXCLUDED.observed_at, updated_at = now()
         WHERE portfolio_scan_checkpoints.source_block <= EXCLUDED.source_block`,
        [network, account.toLowerCase(), sourceBlock.toString(), observedAt],
      );
    });
    return this.list(network, account);
  }

  async list(network: SomniaNetwork, account: string): Promise<readonly PortfolioPosition[]> {
    const result = await this.pool.query<{ snapshot: unknown }>(
      `SELECT snapshot FROM portfolio_positions
       WHERE network = $1 AND account_address = $2 AND active = true
       ORDER BY observed_at DESC, market_id, outcome`,
      [network, account.toLowerCase()],
    );
    return result.rows.map((row) => PortfolioPositionSchema.parse(row.snapshot));
  }
}
