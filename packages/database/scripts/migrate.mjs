import { migrate } from "./migration-library.mjs";

const direction = process.argv[2] ?? "up";
if (direction !== "up" && direction !== "down") {
  throw new Error("Migration direction must be 'up' or 'down'.");
}

const connectionString = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL (or TEST_DATABASE_URL in CI) is required to run migrations.");
}

const result = await migrate(connectionString, direction);
const changed = direction === "up" ? result.applied : result.reverted;
process.stdout.write(
  changed.length > 0
    ? `${direction === "up" ? "Applied" : "Reverted"} migrations: ${changed.join(", ")}\n`
    : "Database schema is already current.\n",
);
