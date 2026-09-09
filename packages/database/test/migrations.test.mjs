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
    } finally {
      await pool.end();
    }

    const reverted = await migrate(connectionString, "down");
    assert.deepEqual(reverted.reverted, [latestVersion]);
    const reapplied = await migrate(connectionString, "up");
    assert.deepEqual(reapplied.applied, [latestVersion]);
  },
);
