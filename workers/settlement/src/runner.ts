import { loadServerEnvironment } from "@eventrail/config/server";
import { createDatabasePool, PostgresClaimRepository } from "@eventrail/database";
import { createDreamDexAdapter } from "@eventrail/dreamdex-adapter";
import { FinalizedMarketScanner, runClaimScannerOnSchedule } from "./scanner.js";

const config = loadServerEnvironment(process.env);
const database = createDatabasePool(config.DATABASE_URL);
const controller = new AbortController();
const scanner = new FinalizedMarketScanner({
  network: "shannon",
  reader: createDreamDexAdapter({ network: "shannon" }),
  store: new PostgresClaimRepository(database),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());

try {
  await runClaimScannerOnSchedule(scanner, config.WORKER_INTERVAL_MS, controller.signal);
} finally {
  await database.end();
}
