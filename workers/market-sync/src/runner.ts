import { loadServerEnvironment } from "@eventrail/config/server";
import { createDatabasePool, PostgresDreamDexMarketGenerationRepository } from "@eventrail/database";
import { createDreamDexAdapter } from "@eventrail/dreamdex-adapter";
import { connectEventRailRedis, DreamDexEventBus } from "@eventrail/redis";
import { MarketSynchronizer } from "./index.js";

const config = loadServerEnvironment(process.env);
const database = createDatabasePool(config.DATABASE_URL);
const redis = await connectEventRailRedis(config.REDIS_URL, config.REDIS_CA_CERT);
const controller = new AbortController();
const synchronizer = new MarketSynchronizer(
  createDreamDexAdapter({ network: "shannon" }),
  new PostgresDreamDexMarketGenerationRepository(database),
  new DreamDexEventBus(redis),
  { historicalLimit: positiveInteger(process.env.MARKET_SYNC_HISTORICAL_LIMIT ?? "250") },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());

while (!controller.signal.aborted) {
  try {
    await synchronizer.synchronize(controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) console.error("Market synchronization failed", safeError(error));
  }
  await delay(config.WORKER_INTERVAL_MS, controller.signal);
}

await redis.close();
await database.end();

function safeError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: "Unknown failure" };
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(parsed))
    throw new Error("MARKET_SYNC_HISTORICAL_LIMIT must be a positive integer");
  return parsed;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
