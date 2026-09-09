import { ClaimCandidateSchema, type ClaimCandidate, type SomniaNetwork } from "@eventrail/types";
import type { DatabasePool } from "./pool.js";

export class PostgresClaimRepository {
  constructor(private readonly pool: DatabasePool) {}

  async listTrackedAccounts(network: SomniaNetwork): Promise<readonly string[]> {
    const result = await this.pool.query<{ account_address: string }>(
      "SELECT DISTINCT account_address FROM portfolio_positions WHERE network = $1",
      [network],
    );
    return result.rows.map((row) => row.account_address);
  }

  async readCheckpoint(network: SomniaNetwork): Promise<{ offset: number; completed: boolean }> {
    const result = await this.pool.query<{ page_offset: number; completed: boolean }>(
      "SELECT page_offset, completed FROM claim_scan_checkpoints WHERE network = $1",
      [network],
    );
    const row = result.rows[0];
    return row ? { offset: row.page_offset, completed: row.completed } : { offset: 0, completed: false };
  }

  async writeCheckpoint(network: SomniaNetwork, offset: number, completed: boolean): Promise<void> {
    await this.pool.query(
      `INSERT INTO claim_scan_checkpoints (network, page_offset, completed)
       VALUES ($1,$2,$3)
       ON CONFLICT (network) DO UPDATE SET
         page_offset = EXCLUDED.page_offset, completed = EXCLUDED.completed, updated_at = now()`,
      [network, offset, completed],
    );
  }

  async upsertCandidates(inputs: readonly ClaimCandidate[]): Promise<void> {
    for (const input of inputs) {
      const candidate = ClaimCandidateSchema.parse(input);
      await this.pool.query(
        `INSERT INTO claim_candidates
          (network, account_address, market_id, outcome, status, source_block, candidate, observed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
         ON CONFLICT (network, account_address, market_id, outcome) DO UPDATE SET
           status = EXCLUDED.status, source_block = EXCLUDED.source_block,
           candidate = EXCLUDED.candidate, observed_at = EXCLUDED.observed_at, updated_at = now()
         WHERE claim_candidates.source_block <= EXCLUDED.source_block`,
        [
          candidate.network,
          candidate.account.toLowerCase(),
          candidate.marketId.toLowerCase(),
          candidate.outcome,
          candidate.status,
          candidate.freshness.sourceBlock,
          JSON.stringify(candidate),
          candidate.freshness.observedAt,
        ],
      );
    }
  }

  async list(network: SomniaNetwork, account: string): Promise<readonly ClaimCandidate[]> {
    const result = await this.pool.query<{ candidate: unknown }>(
      `SELECT candidate FROM claim_candidates
       WHERE network = $1 AND account_address = $2
       ORDER BY observed_at DESC, market_id, outcome`,
      [network, account.toLowerCase()],
    );
    return result.rows.map((row) => ClaimCandidateSchema.parse(row.candidate));
  }
}
