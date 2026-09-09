import { createGateway } from "./app.js";
import { describeServerEnvironment, loadServerEnvironment } from "@eventrail/config/server";
import { DreamDexEventBus, connectEventRailRedis } from "@eventrail/redis";
import { createDreamDexAdapter } from "@eventrail/dreamdex-adapter";

const config = loadServerEnvironment(process.env);
const { listen } = describeServerEnvironment(config);

const redis = await connectEventRailRedis(config.REDIS_URL);
const app = createGateway({
  eventStream: new DreamDexEventBus(redis),
  dataReader: createDreamDexAdapter({ network: "shannon" }),
});
app.log.info({ configuration: describeServerEnvironment(config) }, `Starting EventRail gateway on ${listen}`);
await app.listen({ host: config.HOST, port: config.PORT });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await redis.close();
    process.exit(0);
  });
}
