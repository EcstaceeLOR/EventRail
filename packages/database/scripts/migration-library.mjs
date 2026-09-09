import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = resolve(packageRoot, "migrations");

function checksum(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export async function loadMigrations() {
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_.+\.up\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    names.map(async (upName) => {
      const version = upName.slice(0, upName.indexOf("_"));
      const downName = upName.replace(/\.up\.sql$/, ".down.sql");
      const up = await readFile(resolve(migrationDirectory, upName), "utf8");
      const down = await readFile(resolve(migrationDirectory, downName), "utf8");
      return { version, name: basename(upName, ".up.sql"), up, down, checksum: checksum(up) };
    }),
  );
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function migrate(connectionString, direction = "up") {
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  const client = await pool.connect();

  try {
    await ensureMigrationTable(client);
    const migrations = await loadMigrations();
    const appliedResult = await client.query(
      "SELECT version, checksum FROM schema_migrations ORDER BY version",
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const appliedChecksum = applied.get(migration.version);
      if (appliedChecksum && appliedChecksum !== migration.checksum) {
        throw new Error(`Migration ${migration.version} changed after it was applied.`);
      }
    }

    if (direction === "down") {
      const migration = [...migrations].reverse().find((item) => applied.has(item.version));
      if (!migration) return { applied: [], reverted: [] };

      await client.query("BEGIN");
      try {
        await client.query(migration.down);
        await client.query("DELETE FROM schema_migrations WHERE version = $1", [migration.version]);
        await client.query("COMMIT");
        return { applied: [], reverted: [migration.version] };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    const pending = migrations.filter((migration) => !applied.has(migration.version));
    for (const migration of pending) {
      await client.query("BEGIN");
      try {
        await client.query(migration.up);
        await client.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [
          migration.version,
          migration.name,
          migration.checksum,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return { applied: pending.map((migration) => migration.version), reverted: [] };
  } finally {
    client.release();
    await pool.end();
  }
}
