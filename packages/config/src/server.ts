import { z } from "zod";
import { SOMNIA_NETWORKS } from "./network.js";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const postgresUrl = z.url().refine((value) => /^postgres(?:ql)?:\/\//.test(value), {
  message: "must use postgres:// or postgresql://",
});
const redisUrl = z.url().refine((value) => /^rediss?:\/\//.test(value), {
  message: "must use redis:// or rediss://",
});
const originList = z
  .string()
  .default("")
  .transform((value, context) => {
    const origins = value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        context.addIssue({ code: "custom", message: `contains invalid origin ${origin}` });
        return z.NEVER;
      }
    }
    return [...new Set(origins)];
  });

export const ServerEnvironmentSchema = z.object({
  APP_ENV: z.enum(["local", "test", "preview", "staging", "production"]).default("local"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  DATABASE_URL: postgresUrl,
  REDIS_URL: redisUrl,
  REDIS_CA_CERT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SOMNIA_RPC_URL: z.preprocess(emptyToUndefined, z.url().default(SOMNIA_NETWORKS.shannon.rpcUrl)),
  SOMNIA_WS_URL: z.preprocess(emptyToUndefined, z.url().default(SOMNIA_NETWORKS.shannon.wsUrl)),
  DREAMDEX_INDEXER_URL: z.preprocess(
    emptyToUndefined,
    z.url().default(SOMNIA_NETWORKS.shannon.dreamDexIndexerUrl),
  ),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RELEASE_VERSION: z.string().min(1).max(128).default("0.1.0-local"),
  API_AUTH_REQUIRED: z.preprocess((value) => value === "1" || value === "true", z.boolean()).default(false),
  TRANSACTION_PLANNING_ENABLED: z
    .preprocess((value) => value !== "0" && value !== "false", z.boolean())
    .default(true),
  CORS_ALLOWED_ORIGINS: originList,
  WORKER_INTERVAL_MS: z.coerce.number().int().min(250).max(3_600_000).default(5_000),
  API_KEY_PEPPER: z.string().min(16).default("local-only-change-me"),
  WEBHOOK_SIGNING_KEY: z.string().min(16).default("local-webhook-key"),
  EVENTRAIL_BUILDER_ADDRESS: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .optional(),
  ),
  EVENTRAIL_BUILDER_FEE_BPS_TIMES_1K: z.coerce.number().int().min(0).max(10_000_000).default(0),
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
    apiAuthRequired: config.API_AUTH_REQUIRED,
    transactionPlanningEnabled: config.TRANSACTION_PLANNING_ENABLED,
    corsOriginCount: config.CORS_ALLOWED_ORIGINS.length,
    workerIntervalMs: config.WORKER_INTERVAL_MS,
    releaseVersion: config.RELEASE_VERSION,
  } as const;
}
