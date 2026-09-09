import { createGateway } from "./app.js";
import { describeServerEnvironment, loadServerEnvironment } from "@eventrail/config/server";
import { DreamDexEventBus, connectEventRailRedis } from "@eventrail/redis";
import { createDreamDexAdapter } from "@eventrail/dreamdex-adapter";
import {
  createDatabasePool,
  PostgresTradeActivityReader,
  PostgresTradeExecutionRepository,
  PostgresTradePlanStore,
} from "@eventrail/database";
import { TradePlanner } from "@eventrail/trading";

const config = loadServerEnvironment(process.env);
const { listen } = describeServerEnvironment(config);

const redis = await connectEventRailRedis(config.REDIS_URL);
const database = createDatabasePool(config.DATABASE_URL);
const executions = new PostgresTradeExecutionRepository(database);
const app = createGateway({
  eventStream: new DreamDexEventBus(redis),
  dataReader: createDreamDexAdapter({ network: "shannon" }),
  tradePlanner: new TradePlanner({ store: new PostgresTradePlanStore(database) }),
  activityReader: new PostgresTradeActivityReader(database),
  submissionStore: executions,
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
