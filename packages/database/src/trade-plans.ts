import { TradePlanSchema, type TradePlan } from "@eventrail/types";
import type { DatabasePool } from "./pool.js";

export interface PersistedTradePlan {
  requestHash: `0x${string}`;
  plan: TradePlan;
}

export class PostgresTradePlanStore {
  constructor(private readonly pool: DatabasePool) {}

  async find(network: string, account: string, idempotencyKey: string): Promise<PersistedTradePlan | null> {
    const result = await this.pool.query<{ request_hash: `0x${string}`; plan: unknown }>(
      `SELECT request_hash, plan
       FROM trade_plans
       WHERE network = $1 AND account_address = $2 AND idempotency_key = $3`,
      [network, account.toLowerCase(), idempotencyKey],
    );
    const row = result.rows[0];
    return row ? { requestHash: row.request_hash, plan: TradePlanSchema.parse(row.plan) } : null;
  }

  async putIfAbsent(
    network: string,
    account: string,
    idempotencyKey: string,
    record: PersistedTradePlan,
  ): Promise<PersistedTradePlan> {
    const plan = TradePlanSchema.parse(record.plan);
    await this.pool.query(
      `INSERT INTO trade_plans
        (plan_id, plan_hash, request_hash, idempotency_key, network, chain_id,
         account_address, market_id, pool_address, plan, source_block, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
       ON CONFLICT (network, account_address, idempotency_key) DO NOTHING`,
      [
        plan.planId,
        plan.planHash,
        record.requestHash,
        idempotencyKey,
        network,
        plan.chainId,
        account.toLowerCase(),
        plan.marketId.toLowerCase(),
        plan.poolAddress.toLowerCase(),
        JSON.stringify(plan),
        plan.quote.sourceBlock,
        plan.expiresAt,
        plan.createdAt,
      ],
    );
    const stored = await this.find(network, account, idempotencyKey);
    if (!stored) throw new Error("Trade plan persistence did not converge.");
    return stored;
  }
}
