import { createGateway } from "./app.js";
import { describeServerEnvironment, loadServerEnvironment } from "@eventrail/config/server";
import { DreamDexEventBus, connectEventRailRedis } from "@eventrail/redis";
import { createDreamDexAdapter, getDreamDexRegistry } from "@eventrail/dreamdex-adapter";
import {
  createDatabasePool,
  PostgresTradeActivityReader,
  PostgresTradeExecutionRepository,
  PostgresTradePlanStore,
  PostgresPortfolioRepository,
} from "@eventrail/database";
import { TradePlanner } from "@eventrail/trading";

const config = loadServerEnvironment(process.env);
const { listen } = describeServerEnvironment(config);

const redis = await connectEventRailRedis(config.REDIS_URL);
const database = createDatabasePool(config.DATABASE_URL);
const executions = new PostgresTradeExecutionRepository(database);
const registry = getDreamDexRegistry("shannon");
const binaryModule = registry.addresses.binaryModule;
if (!binaryModule) throw new Error("DreamDEX binary module is not configured");
const app = createGateway({
  eventStream: new DreamDexEventBus(redis),
  dataReader: createDreamDexAdapter({ network: "shannon" }),
  tradePlanner: new TradePlanner({ store: new PostgresTradePlanStore(database) }),
  activityReader: new PostgresTradeActivityReader(database),
  submissionStore: executions,
  portfolioStore: new PostgresPortfolioRepository(database),
  redemption: {
    chainId: registry.chainId,
    moduleAddress: binaryModule,
  },
});
app.log.info({ configuration: describeServerEnvironment(config) }, `Starting EventRail gateway on ${listen}`);
await app.listen({ host: config.HOST, port: config.PORT });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await redis.close();
    await database.end();
    process.exit(0);
  });
}
