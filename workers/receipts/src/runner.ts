import { loadServerEnvironment } from "@eventrail/config/server";
import { createDatabasePool, PostgresTradeExecutionRepository } from "@eventrail/database";
import { connectEventRailRedis, DreamDexEventBus } from "@eventrail/redis";
import { createPublicClient, http, type Hex } from "viem";
import { TradeReceiptReconciler, type ChainReceipt } from "./index.js";

const config = loadServerEnvironment(process.env);
const database = createDatabasePool(config.DATABASE_URL);
const redis = await connectEventRailRedis(config.REDIS_URL);
const repository = new PostgresTradeExecutionRepository(database);
const events = new DreamDexEventBus(redis);
const chain = createPublicClient({ transport: http(config.SOMNIA_RPC_URL) });
const reconciler = new TradeReceiptReconciler(
  {
    async getReceipt(hash: Hex): Promise<ChainReceipt | null> {
      try {
        const receipt = await chain.getTransactionReceipt({ hash });
        return {
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          logs: receipt.logs.map((log) => ({
            address: log.address,
            data: log.data,
            topics: log.topics,
            logIndex: log.logIndex,
          })),
        };
      } catch (error) {
        if (error instanceof Error && error.name === "TransactionReceiptNotFoundError") return null;
        throw error;
      }
    },
  },
  repository,
  events,
);

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());

while (!controller.signal.aborted) {
  const pending = await repository.listPending();
  for (const submission of pending) {
    if (controller.signal.aborted) break;
    await reconciler.reconcile(submission);
  }
  await delay(pending.length === 0 ? 2_000 : 500, controller.signal);
}

await redis.close();
await database.end();

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
