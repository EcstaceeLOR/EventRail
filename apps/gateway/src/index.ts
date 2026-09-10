import { createGateway } from "./app.js";
import { describeServerEnvironment, loadServerEnvironment } from "@eventrail/config/server";
import { DreamDexEventBus, connectEventRailRedis } from "@eventrail/redis";
import {
  createBuilderCapabilityReader,
  createDreamDexAdapter,
  getDreamDexRegistry,
} from "@eventrail/dreamdex-adapter";
import {
  createDatabasePool,
  PostgresTradeActivityReader,
  PostgresTradeExecutionRepository,
  PostgresTradePlanStore,
  PostgresPortfolioRepository,
  PostgresIntegratorRepository,
} from "@eventrail/database";
import { TradePlanner } from "@eventrail/trading";
import { ApiAccessService, OperationalMonitor } from "@eventrail/platform";
import { createPublicClient, http } from "viem";

const config = loadServerEnvironment(process.env);
const { listen } = describeServerEnvironment(config);

const redis = await connectEventRailRedis(config.REDIS_URL, config.REDIS_CA_CERT);
const database = createDatabasePool(config.DATABASE_URL);
const executions = new PostgresTradeExecutionRepository(database);
const integrators = new PostgresIntegratorRepository(database);
const registry = getDreamDexRegistry("shannon");
const monitor = new OperationalMonitor(config.RELEASE_VERSION);
monitor.set("planning_enabled", config.TRANSACTION_PLANNING_ENABLED ? 1 : 0);
const chain = createPublicClient({ transport: http(config.SOMNIA_RPC_URL) });
const binaryModule = registry.addresses.binaryModule;
if (!binaryModule) throw new Error("DreamDEX binary module is not configured");
const app = createGateway({
  monitor,
  planningEnabled: config.TRANSACTION_PLANNING_ENABLED,
  allowedOrigins: config.CORS_ALLOWED_ORIGINS,
  readiness: async () => {
    const [postgres, redisReady, rpc] = await Promise.allSettled([
      database.query("SELECT 1"),
      redis.ping(),
      chain.getBlockNumber(),
    ]);
    monitor.set("stream_connected", redisReady.status === "fulfilled" ? 1 : 0);
    return {
      postgres: postgres.status === "fulfilled",
      redis: redisReady.status === "fulfilled",
      rpc: rpc.status === "fulfilled",
    };
  },
  apiAccess: new ApiAccessService(integrators, config.API_KEY_PEPPER),
  apiAuthRequired: config.API_AUTH_REQUIRED,
  apiEnvironment: config.APP_ENV === "production" ? "live" : "test",
  integrators,
  webhookMasterKey: config.WEBHOOK_SIGNING_KEY,
  ...(config.EVENTRAIL_BUILDER_ADDRESS && config.EVENTRAIL_BUILDER_FEE_BPS_TIMES_1K > 0
    ? {
        builder: {
          address: config.EVENTRAIL_BUILDER_ADDRESS as `0x${string}`,
          feeBpsTimes1k: BigInt(config.EVENTRAIL_BUILDER_FEE_BPS_TIMES_1K),
          getCapability: createBuilderCapabilityReader("shannon"),
        },
      }
    : {}),
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
