import {
  NormalizedFillSchema,
  TradeExecutionSchema,
  type NormalizedFill,
  type TradeExecution,
  TradePlanSchema,
  type TradePlan,
} from "@eventrail/types";
import { withDatabaseTransaction, type DatabasePool } from "./pool.js";

export class PostgresTradeExecutionRepository {
  constructor(private readonly pool: DatabasePool) {}

  async recordSubmission(input: {
    planId: string;
    planHash: string;
    account: string;
    transactionHash: string;
    observedAt?: string;
  }): Promise<void> {
    await withDatabaseTransaction(this.pool, async (client) => {
      const result = await client.query<{ plan: unknown }>(
        `SELECT plan FROM trade_plans
         WHERE plan_id = $1 AND plan_hash = $2 AND account_address = $3
         FOR UPDATE`,
        [input.planId, input.planHash, input.account.toLowerCase()],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Trade submission does not match a persisted plan.");
      const plan = TradePlanSchema.parse(row.plan);
      const observedAt = input.observedAt ?? new Date().toISOString();
      await client.query(
        `INSERT INTO trade_executions
          (network, transaction_hash, plan_id, plan_hash, account_address, market_id, pool_address,
           state, requested_quantity, filled_quantity, realized_quote_quantity, observed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted',$8,0,0,$9)
         ON CONFLICT (network, transaction_hash) DO NOTHING`,
        [
          plan.network,
          input.transactionHash.toLowerCase(),
          plan.planId,
          plan.planHash,
          plan.account.toLowerCase(),
          plan.marketId.toLowerCase(),
          plan.poolAddress.toLowerCase(),
          plan.quantity,
          observedAt,
        ],
      );
      await client.query(
        `UPDATE trade_plans SET state = 'submitted', transaction_hash = $2, updated_at = now()
         WHERE plan_id = $1 AND state IN ('planned', 'wallet_pending', 'submitted')`,
        [plan.planId, input.transactionHash.toLowerCase()],
      );
    });
  }

  async listPending(limit = 100): Promise<readonly { plan: TradePlan; transactionHash: `0x${string}` }[]> {
    const result = await this.pool.query<{ plan: unknown; transaction_hash: `0x${string}` }>(
      `SELECT p.plan, e.transaction_hash
       FROM trade_executions e JOIN trade_plans p ON p.plan_id = e.plan_id
       WHERE e.state IN ('submitted', 'confirmed')
       ORDER BY e.observed_at ASC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)],
    );
    return result.rows.map((row) => ({
      plan: TradePlanSchema.parse(row.plan),
      transactionHash: row.transaction_hash,
    }));
  }

  async save(executionInput: TradeExecution, fillsInput: readonly NormalizedFill[]): Promise<void> {
    const execution = TradeExecutionSchema.parse(executionInput);
    const fills = fillsInput.map((fill) => NormalizedFillSchema.parse(fill));
    await withDatabaseTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO trade_executions
          (network, transaction_hash, plan_id, plan_hash, account_address, market_id, pool_address,
           state, requested_quantity, filled_quantity, realized_quote_quantity,
           realized_average_price, block_number, error_code, observed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (network, transaction_hash) DO UPDATE SET
           state = EXCLUDED.state,
           filled_quantity = EXCLUDED.filled_quantity,
           realized_quote_quantity = EXCLUDED.realized_quote_quantity,
           realized_average_price = EXCLUDED.realized_average_price,
           block_number = EXCLUDED.block_number,
           error_code = EXCLUDED.error_code,
           observed_at = EXCLUDED.observed_at,
           updated_at = now()
         WHERE trade_executions.block_number IS NULL
            OR EXCLUDED.block_number IS NULL
            OR trade_executions.block_number <= EXCLUDED.block_number`,
        [
          execution.network,
          execution.transactionHash.toLowerCase(),
          execution.planId,
          execution.planHash,
          execution.account.toLowerCase(),
          execution.marketId.toLowerCase(),
          execution.poolAddress.toLowerCase(),
          execution.state,
          execution.requestedQuantity,
          execution.filledQuantity,
          execution.realizedQuoteQuantity,
          execution.realizedAveragePrice,
          execution.blockNumber,
          execution.errorCode,
          execution.observedAt,
        ],
      );
      for (const fill of fills) {
        await client.query(
          `INSERT INTO trade_execution_fills
            (network, transaction_hash, log_index, plan_id, market_id, pool_address,
             outcome, side, price, quantity, quote_quantity, block_number, observed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (network, transaction_hash, log_index) DO NOTHING`,
          [
            fill.network,
            fill.transactionHash.toLowerCase(),
            Number(fill.logIndex),
            execution.planId,
            fill.marketId.toLowerCase(),
            fill.poolAddress.toLowerCase(),
            fill.outcome,
            fill.side,
            fill.price,
            fill.quantity,
            fill.quoteQuantity,
            fill.blockNumber,
            execution.observedAt,
          ],
        );
      }
      await client.query(
        `UPDATE trade_plans
         SET state = $2, transaction_hash = $3, updated_at = now()
         WHERE plan_id = $1`,
        [execution.planId, execution.state, execution.transactionHash.toLowerCase()],
      );
    });
  }
}
