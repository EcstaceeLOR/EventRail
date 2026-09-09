import { z } from "zod";
import { SOMNIA_NETWORKS } from "./network.js";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const postgresUrl = z.url().refine((value) => /^postgres(?:ql)?:\/\//.test(value), {
  message: "must use postgres:// or postgresql://",
});
const redisUrl = z.url().refine((value) => /^rediss?:\/\//.test(value), {
  message: "must use redis:// or rediss://",
});

export const ServerEnvironmentSchema = z.object({
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  DATABASE_URL: postgresUrl,
  REDIS_URL: redisUrl,
  SOMNIA_RPC_URL: z.preprocess(emptyToUndefined, z.url().default(SOMNIA_NETWORKS.shannon.rpcUrl)),
  SOMNIA_WS_URL: z.preprocess(emptyToUndefined, z.url().default(SOMNIA_NETWORKS.shannon.wsUrl)),
  DREAMDEX_INDEXER_URL: z.preprocess(
    emptyToUndefined,
    z.url().default(SOMNIA_NETWORKS.shannon.dreamDexIndexerUrl),
  ),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type ServerEnvironment = z.infer<typeof ServerEnvironmentSchema>;

export function loadServerEnvironment(input: NodeJS.ProcessEnv): ServerEnvironment {
  const result = ServerEnvironmentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server configuration: ${details}`);
  }
  return result.data;
}

export function describeServerEnvironment(config: ServerEnvironment) {
  return {
    appEnvironment: config.APP_ENV,
    listen: `${config.HOST}:${config.PORT}`,
    databaseHost: new URL(config.DATABASE_URL).host,
    redisHost: new URL(config.REDIS_URL).host,
    somniaRpcHost: new URL(config.SOMNIA_RPC_URL).host,
    dreamDexIndexerHost: new URL(config.DREAMDEX_INDEXER_URL).host,
  } as const;
}
