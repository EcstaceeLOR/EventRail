import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { loadMigrations, migrate } from "../scripts/migration-library.mjs";

test("every forward migration has a non-empty rollback", async () => {
  const migrations = await loadMigrations();
  assert.ok(migrations.length > 0);
  for (const migration of migrations) {
    assert.match(migration.version, /^\d+$/);
    assert.ok(migration.up.trim().length > 0);
    assert.ok(migration.down.trim().length > 0);
  }
});

test(
  "migrations apply, roll back, and reapply against PostgreSQL",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    const migrations = await loadMigrations();
    const latestVersion = migrations.at(-1)?.version;
    assert.ok(latestVersion);
    await migrate(connectionString, "up");

    const pool = new pg.Pool({ connectionString, max: 1 });
    try {
      const tableResult = await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      );
      assert.ok(tableResult.rows.some((row) => row.tablename === "markets"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "trades"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "dreamdex_market_generations"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "trade_plans"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "trade_executions"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "trade_execution_fills"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "portfolio_positions"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "claim_candidates"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "claim_scan_checkpoints"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "redemption_records"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "integrators"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "integrator_api_keys"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "integrator_analytics_events"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "webhook_deliveries"));
      assert.ok(tableResult.rows.some((row) => row.tablename === "builder_attribution_receipts"));
    } finally {
      await pool.end();
    }

    const reverted = await migrate(connectionString, "down");
    assert.deepEqual(reverted.reverted, [latestVersion]);
    const reapplied = await migrate(connectionString, "up");
    assert.deepEqual(reapplied.applied, [latestVersion]);

    const integrationPool = new pg.Pool({ connectionString, max: 1 });
    try {
      const integratorId = "00000000-0000-4000-8000-000000000064";
      await integrationPool.query(
        `INSERT INTO integrators (id, slug, display_name, owner_address)
         VALUES ($1, 'm6-integration', 'M6 integration', '0x1111111111111111111111111111111111111111')`,
        [integratorId],
      );
      const event = [
        "m6-event-0001",
        integratorId,
        "test",
        "ci",
        "trade_filled",
        `0x${"ab".repeat(32)}`,
        `0x${"cd".repeat(32)}`,
        "1000000",
        "2026-09-09T10:00:00.000Z",
      ];
      const insert = `INSERT INTO integrator_analytics_events
        (id, integrator_id, environment, embed_id, event_name, market_id, transaction_hash, volume, occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`;
      assert.equal((await integrationPool.query(insert, event)).rowCount, 1);
      assert.equal((await integrationPool.query(insert, event)).rowCount, 0);
      const stored = await integrationPool.query(
        "SELECT analytics_retention_days FROM integrators WHERE id = $1",
        [integratorId],
      );
      assert.equal(stored.rows[0].analytics_retention_days, 90);
    } finally {
      await integrationPool.end();
    }
  },
);
