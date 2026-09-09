import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed local data.");

const url = new URL(connectionString);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!localHosts.has(url.hostname) || url.pathname !== "/eventrail") {
  throw new Error("Seeding is restricted to the local 'eventrail' database.");
}

const pool = new pg.Pool({ connectionString, max: 1 });
try {
  await pool.query(
    `INSERT INTO integrators (slug, display_name)
     VALUES ('eventrail-local', 'EventRail local development')
     ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()`,
  );
  process.stdout.write("Seeded deterministic local development data.\n");
} finally {
  await pool.end();
}
