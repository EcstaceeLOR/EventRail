import {
  TradeActivitySchema,
  TradePlanSchema,
  type SomniaNetwork,
  type TradeActivity,
} from "@eventrail/types";
import type { DatabasePool } from "./pool.js";

export interface TradeActivityFilter {
  network: SomniaNetwork;
  account: string;
  marketId?: string;
  status?: string;
  limit?: number;
}

interface ActivityRow {
  plan_id: string;
  plan_hash: `0x${string}`;
  network: SomniaNetwork;
  account_address: `0x${string}`;
  market_id: `0x${string}`;
  plan: unknown;
  plan_state: string;
  execution_state: string | null;
  transaction_hash: `0x${string}` | null;
  filled_quantity: string | null;
  realized_average_price: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresTradeActivityReader {
  constructor(private readonly pool: DatabasePool) {}

  async list(input: TradeActivityFilter): Promise<readonly TradeActivity[]> {
    const values: unknown[] = [input.network, input.account.toLowerCase()];
    const conditions = ["p.network = $1", "p.account_address = $2"];
    if (input.marketId) {
      values.push(input.marketId.toLowerCase());
      conditions.push(`p.market_id = $${values.length}`);
    }
    if (input.status) {
      values.push(input.status);
      conditions.push(`COALESCE(e.state, p.state) = $${values.length}`);
    }
    values.push(Math.min(Math.max(input.limit ?? 100, 1), 250));
    const result = await this.pool.query<ActivityRow>(
      `SELECT p.plan_id, p.plan_hash, p.network, p.account_address, p.market_id, p.plan,
              p.state AS plan_state, e.state AS execution_state, e.transaction_hash,
              e.filled_quantity::text, e.realized_average_price::text,
              p.created_at, COALESCE(e.updated_at, p.updated_at) AS updated_at
       FROM trade_plans p
       LEFT JOIN trade_executions e ON e.plan_id = p.plan_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY COALESCE(e.updated_at, p.updated_at) DESC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) => {
      const plan = TradePlanSchema.parse(row.plan);
      return TradeActivitySchema.parse({
        planId: row.plan_id,
        planHash: row.plan_hash,
        network: row.network,
        account: row.account_address,
        marketId: row.market_id,
        activityType: "trade",
        outcome: plan.outcome,
        side: plan.side,
        state: row.execution_state ?? row.plan_state,
        quotedQuantity: plan.quantity,
        quotedPrice: plan.quote.averagePrice,
        quotedMaximumCost: plan.quote.maximumCost,
        realizedQuantity: row.filled_quantity ?? "0",
        realizedAveragePrice: row.realized_average_price,
        transactionHash: row.transaction_hash,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      });
    });
  }
}
