import Fastify from "fastify";
import { z } from "zod";
import { calculateTradeQuote, QuoteError, quoteExecutableDepth } from "@eventrail/core";
import type { DreamDexReadAdapter } from "@eventrail/dreamdex-adapter";
import type { EventBusRecord } from "@eventrail/redis";
import {
  MarketSeriesSchema,
  PlanPolicySchema,
  TradeQuoteSchema,
  type HealthStatus,
  type MarketSeries,
  type NormalizedMarket,
  type SomniaNetwork,
  type TradeActivity,
  type PortfolioPosition,
  RedemptionPlanSchema,
} from "@eventrail/types";
import {
  createRedemptionPlan,
  createBuilderApprovalCall,
  PlanConflictError,
  RedemptionPlanError,
  type CreateTradePlanInput,
} from "@eventrail/trading";
import {
  ApiAccessError,
  ANALYTICS_EVENTS,
  EmbedConfigSchema,
  deriveWebhookSecret,
  extractBearerToken,
  type ApiAccessService,
  type ApiEnvironment,
  type ApiKeyRecord,
  type EmbedConfig,
  type AnalyticsEvent,
  type WebhookEventName,
  type OperationalMonitor,
} from "@eventrail/platform";

export interface PublicEventStream {
  subscribe(options: {
    network: SomniaNetwork;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<EventBusRecord>;
}

export interface GatewayOptions {
  monitor?: OperationalMonitor;
  planningEnabled?: boolean;
  allowedOrigins?: readonly string[];
  readiness?: () => Promise<Record<string, boolean>>;
  apiAccess?: ApiAccessService;
  apiAuthRequired?: boolean;
  apiEnvironment?: ApiEnvironment;
  integrators?: {
    create(name: string, ownerAddress?: string): Promise<{ id: string; name: string }>;
    listKeys(integratorId: string): Promise<Array<Omit<ApiKeyRecord, "secretHash">>>;
    revoke(id: string, at: string): Promise<void>;
    saveConfig(integratorId: string, environment: ApiEnvironment, config: EmbedConfig): Promise<void>;
    getConfig(integratorId: string, environment: ApiEnvironment): Promise<unknown | null>;
    audit(integratorId: string, actor: string, action: string, metadata?: unknown): Promise<void>;
    recordAnalytics(events: readonly AnalyticsEvent[]): Promise<number>;
    analytics(
      integratorId: string,
      environment: ApiEnvironment,
      from: string,
      to: string,
      filters?: { embedId?: string; marketId?: string },
    ): Promise<unknown>;
    setAnalyticsRetention(integratorId: string, days: number): Promise<void>;
    createWebhook(
      integratorId: string,
      url: string,
      events: readonly WebhookEventName[],
    ): Promise<{
      id: string;
      keyId: string;
      integratorId: string;
      url: string;
      events: readonly WebhookEventName[];
      enabled: boolean;
    }>;
    listWebhooks(integratorId: string): Promise<unknown>;
    rotateWebhook(
      integratorId: string,
      endpointId: string,
    ): Promise<{ keyId: string; previousKeyId: string } | null>;
    replayWebhook(integratorId: string, deliveryId: string): Promise<boolean>;
    listWebhookDeliveries(integratorId: string, status?: string): Promise<unknown>;
  };
  webhookMasterKey?: string;
  builder?: {
    address: `0x${string}`;
    feeBpsTimes1k: bigint;
    getCapability(input: { account: `0x${string}`; pool: `0x${string}`; builder: `0x${string}` }): Promise<{
      poolCapBpsTimes1k: bigint;
      userApprovalBpsTimes1k: bigint;
    } | null>;
  };
  eventStream?: PublicEventStream;
  dataReader?: DreamDexReadAdapter;
  heartbeatMs?: number;
  tradePlanner?: { create(input: CreateTradePlanInput): Promise<unknown> };
  activityReader?: {
    list(input: {
      network: SomniaNetwork;
      account: string;
      marketId?: string;
      status?: string;
      limit?: number;
    }): Promise<readonly TradeActivity[]>;
  };
  submissionStore?: {
    recordSubmission(input: {
      planId: string;
      planHash: string;
      account: string;
      transactionHash: string;
    }): Promise<void>;
  };
  portfolioStore?: {
    reconcile(
      network: SomniaNetwork,
      account: string,
      snapshot: Awaited<ReturnType<DreamDexReadAdapter["getPortfolioSnapshot"]>>,
    ): Promise<readonly PortfolioPosition[]>;
  };
  redemption?: {
    chainId: number;
    moduleAddress: `0x${string}`;
  };
}

const EventQuerySchema = z.object({ network: z.enum(["shannon", "mainnet"]).default("shannon") });
const MarketParamsSchema = z.object({ marketId: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });
const AccountParamsSchema = z.object({ account: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });
const BalanceParamsSchema = AccountParamsSchema.extend({ marketId: MarketParamsSchema.shape.marketId });
const CandleQuerySchema = z.object({ intervalSeconds: z.coerce.number().int().positive() });
const QuoteQuerySchema = z.object({
  outcome: z.enum(["up", "down"]),
  side: z.enum(["buy", "sell"]),
  quantity: z.string().regex(/^[1-9][0-9]*$/),
});
const TradeQuoteRequestSchema = z.object({
  marketId: MarketParamsSchema.shape.marketId,
  outcome: z.enum(["up", "down"]),
  side: z.enum(["buy", "sell"]),
  mode: z.enum(["spend", "quantity"]),
  amount: z.string().regex(/^[1-9][0-9]*$/),
  availableBalance: z
    .string()
    .regex(/^(0|[1-9][0-9]*)$/)
    .optional(),
  feeBps: z.number().int().min(0).max(10_000).default(0),
  maxSlippageBps: z.number().int().min(0).max(10_000).default(100),
  minimumFillBps: z.number().int().min(0).max(10_000).default(10_000),
  minimumTimeRemainingSeconds: z.number().int().nonnegative().default(30),
});
const TradePlanRequestSchema = z.object({
  account: AccountParamsSchema.shape.account,
  idempotencyKey: z.string().min(8).max(128),
  quote: TradeQuoteSchema,
  policy: PlanPolicySchema,
  builderFeeApproved: z.boolean().default(false),
});
const FundingRouteRequestSchema = z.object({
  account: AccountParamsSchema.shape.account,
  targetOutputQuantity: z.string().regex(/^[1-9][0-9]*$/),
  maxSlippageBps: z.number().int().min(0).max(2_000).default(100),
});
const ActivityQuerySchema = EventQuerySchema.extend({
  marketId: MarketParamsSchema.shape.marketId.optional(),
  status: z
    .enum([
      "planned",
      "submitted",
      "confirmed",
      "filled",
      "partially_filled",
      "unfilled",
      "reverted",
      "expired",
      "invalidated",
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100),
});
const TradeSubmissionSchema = z.object({
  planId: z.uuid(),
  planHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  account: AccountParamsSchema.shape.account,
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});
const RedemptionPlanRequestSchema = z.object({
  account: AccountParamsSchema.shape.account,
  marketId: MarketParamsSchema.shape.marketId,
});
const IntegratorCreateSchema = z.object({
  name: z.string().min(2).max(80),
  ownerAddress: AccountParamsSchema.shape.account.optional(),
});
const IntegratorParamsSchema = z.object({ integratorId: z.uuid() });
const KeyParamsSchema = IntegratorParamsSchema.extend({ keyId: z.uuid() });
const KeyCreateSchema = z.object({
  label: z.string().min(1).max(80),
  kind: z.enum(["public", "server"]),
  environment: z.enum(["test", "live"]),
  allowedOrigins: z.array(z.url()).max(20).default([]),
  requestsPerMinute: z.number().int().min(1).max(100_000).default(120),
});
const ConfigQuerySchema = z.object({ environment: z.enum(["test", "live"]).default("test") });
const BuilderApprovalSchema = z.object({
  poolAddress: AccountParamsSchema.shape.account,
  maxFeeBpsTimes1k: z.string().regex(/^[1-9][0-9]*$/),
});
const AnalyticsEventSchema = z.object({
  id: z.string().min(8).max(128),
  environment: z.enum(["test", "live"]),
  embedId: z.string().min(1).max(80),
  name: z.enum(ANALYTICS_EVENTS),
  marketId: MarketParamsSchema.shape.marketId.optional(),
  transactionHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),
  volume: z
    .string()
    .regex(/^(0|[1-9][0-9]*)$/)
    .optional(),
  occurredAt: z.iso.datetime(),
});
const AnalyticsQuerySchema = ConfigQuerySchema.extend({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  embedId: z.string().min(1).max(80).optional(),
  marketId: MarketParamsSchema.shape.marketId.optional(),
});
const AnalyticsRetentionSchema = z.object({ days: z.number().int().min(1).max(365) });
const WebhookCreateSchema = z.object({
  url: z.url().refine((value) => value.startsWith("https://"), "Webhooks require HTTPS."),
  events: z.array(z.enum(["fill.created", "market.rolled-over", "market.settled", "claim.updated"])).min(1),
});
const WebhookParamsSchema = IntegratorParamsSchema.extend({ endpointId: z.uuid() });
const DeliveryParamsSchema = IntegratorParamsSchema.extend({ deliveryId: z.uuid() });
const DeliveryQuerySchema = z.object({
  status: z.enum(["pending", "retry", "delivered", "dead_letter"]).optional(),
});

export function createGateway(options: GatewayOptions = {}) {
  const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.headers.cookie"] } });
  const principals = new WeakMap<object, ApiKeyRecord>();

  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "OPTIONS") return;
    const origin = request.headers.origin;
    if (!origin || !options.allowedOrigins?.includes(origin)) {
      return reply.code(403).send({ error: { code: "ORIGIN_DENIED", message: "Origin is not allowed." } });
    }
    return reply
      .headers(corsHeaders(origin))
      .header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
      .header("access-control-allow-headers", "authorization,content-type,idempotency-key,last-event-id")
      .code(204)
      .send();
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const origin = request.headers.origin;
    if (origin && options.allowedOrigins?.includes(origin)) reply.headers(corsHeaders(origin));
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    return payload;
  });

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    const planningRequest =
      request.method === "POST" &&
      /^\/v1\/(builders\/approval-plans|trading\/(quotes|plans)|funding\/routes|redemptions\/plans)$/.test(
        path,
      );
    if (planningRequest && options.planningEnabled === false) {
      return reply.code(503).send({
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Transaction planning is temporarily disabled while reads remain available.",
          requestId: request.id,
          recoverable: true,
        },
      });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "The request did not match the public API contract.",
          requestId: request.id,
          recoverable: false,
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      });
    }
    request.log.error({ err: error }, "Gateway request failed");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
        requestId: request.id,
        recoverable: true,
      },
    });
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!options.apiAccess) return;
    const publicOnboarding = request.method === "POST" && request.url.split("?")[0] === "/v1/integrators";
    if (
      request.url.startsWith("/v1/health") ||
      request.url.startsWith("/v1/ready") ||
      request.url.startsWith("/metrics") ||
      publicOnboarding
    )
      return;
    const management = request.url.startsWith("/v1/integrators/");
    if (!options.apiAuthRequired && !management) return;
    try {
      const token = extractBearerToken(request.headers.authorization);
      const principal = await options.apiAccess.authenticate({
        ...(token ? { token } : {}),
        ...(request.headers.origin ? { origin: request.headers.origin } : {}),
        environment: options.apiEnvironment ?? "test",
        ...(request.routeOptions.url ? { endpoint: request.routeOptions.url } : {}),
      });
      principals.set(request, principal);
      reply.header("x-ratelimit-limit", principal.requestsPerMinute);
    } catch (error) {
      if (error instanceof ApiAccessError) {
        return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get(
    "/v1/health",
    async (): Promise<HealthStatus> =>
      options.monitor?.snapshot() ?? {
        status: "ok",
        service: "eventrail-gateway",
        version: "0.1.0",
        timestamp: new Date().toISOString(),
      },
  );

  app.get("/v1/ready", async (_request, reply) => {
    const checks = options.readiness ? await options.readiness() : { process: true };
    const ready = Object.values(checks).every(Boolean);
    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      service: "eventrail-gateway",
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  app.get("/metrics", async (_request, reply) => {
    reply.type("text/plain; version=0.0.4");
    return options.monitor?.prometheus() ?? "# EventRail operational metrics are not configured.\n";
  });

  app.post("/v1/integrators", async (request, reply) => {
    if (!options.integrators || !options.apiAccess) {
      return reply.code(503).send({ error: "Integrator management is unavailable" });
    }
    const input = IntegratorCreateSchema.parse(request.body);
    const integrator = await options.integrators.create(input.name, input.ownerAddress);
    const issued = await options.apiAccess.issue({
      integratorId: integrator.id,
      label: "Initial server key",
      kind: "server",
      environment: options.apiEnvironment ?? "test",
    });
    await options.integrators.audit(integrator.id, input.ownerAddress ?? "onboarding", "integrator.created");
    return reply.code(201).send({ integrator, apiKey: issued });
  });

  app.get("/v1/integrators/:integratorId/keys", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Integrator management is unavailable" });
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    if (!principalFor(request, principals, integratorId, reply)) return;
    return options.integrators.listKeys(integratorId);
  });

  app.post("/v1/integrators/:integratorId/keys", async (request, reply) => {
    if (!options.integrators || !options.apiAccess) {
      return reply.code(503).send({ error: "Integrator management is unavailable" });
    }
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    const principal = principalFor(request, principals, integratorId, reply);
    if (!principal) return;
    const input = KeyCreateSchema.parse(request.body);
    const issued = await options.apiAccess.issue({ integratorId, ...input });
    await options.integrators.audit(integratorId, principal.prefix, "api_key.created", {
      keyId: issued.key.id,
      kind: input.kind,
      environment: input.environment,
    });
    return reply.code(201).send(issued);
  });

  app.delete("/v1/integrators/:integratorId/keys/:keyId", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Integrator management is unavailable" });
    const { integratorId, keyId } = KeyParamsSchema.parse(request.params);
    const principal = principalFor(request, principals, integratorId, reply);
    if (!principal) return;
    await options.integrators.revoke(keyId, new Date().toISOString());
    await options.integrators.audit(integratorId, principal.prefix, "api_key.revoked", { keyId });
    return reply.code(204).send();
  });

  app.get("/v1/integrators/:integratorId/config", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Integrator management is unavailable" });
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    if (!principalFor(request, principals, integratorId, reply)) return;
    const { environment } = ConfigQuerySchema.parse(request.query);
    const config = await options.integrators.getConfig(integratorId, environment);
    return config ?? reply.code(404).send({ error: "Embed configuration not found" });
  });

  app.put("/v1/integrators/:integratorId/config", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Integrator management is unavailable" });
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    const principal = principalFor(request, principals, integratorId, reply);
    if (!principal) return;
    const { environment } = ConfigQuerySchema.parse(request.query);
    const config = EmbedConfigSchema.parse(request.body);
    if (BigInt(config.defaultSpend) > BigInt(config.risk.maxSpend)) {
      return reply
        .code(400)
        .send({ error: { code: "UNSAFE_CONFIG", message: "Default spend exceeds the mandatory maximum." } });
    }
    await options.integrators.saveConfig(integratorId, environment, config);
    await options.integrators.audit(integratorId, principal.prefix, "embed_config.updated", { environment });
    return config;
  });

  app.post("/v1/integrators/:integratorId/analytics/events", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Analytics is unavailable" });
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    if (!principalFor(request, principals, integratorId, reply)) return;
    const rows = z.array(AnalyticsEventSchema).min(1).max(100).parse(request.body);
    const accepted = await options.integrators.recordAnalytics(
      rows.map((row) => ({
        id: row.id,
        integratorId,
        environment: row.environment,
        embedId: row.embedId,
        name: row.name,
        occurredAt: row.occurredAt,
        ...(row.marketId ? { marketId: row.marketId } : {}),
        ...(row.transactionHash ? { transactionHash: row.transactionHash } : {}),
        ...(row.volume ? { volume: row.volume } : {}),
      })),
    );
    return reply.code(202).send({ accepted });
  });

  app.get("/v1/integrators/:integratorId/analytics/summary", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Analytics is unavailable" });
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    if (!principalFor(request, principals, integratorId, reply)) return;
    const query = AnalyticsQuerySchema.parse(request.query);
    return options.integrators.analytics(integratorId, query.environment, query.from, query.to, {
      ...(query.embedId ? { embedId: query.embedId } : {}),
      ...(query.marketId ? { marketId: query.marketId } : {}),
    });
  });

  app.put("/v1/integrators/:integratorId/analytics/retention", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Analytics is unavailable" });
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    const principal = principalFor(request, principals, integratorId, reply);
    if (!principal) return;
    const { days } = AnalyticsRetentionSchema.parse(request.body);
    await options.integrators.setAnalyticsRetention(integratorId, days);
    await options.integrators.audit(integratorId, principal.prefix, "analytics.retention_updated", {
      days,
    });
    return { days };
  });

  app.get("/v1/integrators/:integratorId/webhooks", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Webhooks are unavailable" });
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    if (!principalFor(request, principals, integratorId, reply)) return;
    return options.integrators.listWebhooks(integratorId);
  });

  app.post("/v1/integrators/:integratorId/webhooks", async (request, reply) => {
    if (!options.integrators || !options.webhookMasterKey)
      return reply.code(503).send({ error: "Webhooks are unavailable" });
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    const principal = principalFor(request, principals, integratorId, reply);
    if (!principal) return;
    const input = WebhookCreateSchema.parse(request.body);
    const endpoint = await options.integrators.createWebhook(integratorId, input.url, input.events);
    const signingSecret = deriveWebhookSecret(
      options.webhookMasterKey,
      integratorId,
      endpoint.id,
      endpoint.keyId,
    );
    await options.integrators.audit(integratorId, principal.prefix, "webhook.created", {
      endpointId: endpoint.id,
    });
    return reply.code(201).send({ endpoint, signingSecret });
  });

  app.post("/v1/integrators/:integratorId/webhooks/:endpointId/rotate", async (request, reply) => {
    if (!options.integrators || !options.webhookMasterKey)
      return reply.code(503).send({ error: "Webhooks are unavailable" });
    const { integratorId, endpointId } = WebhookParamsSchema.parse(request.params);
    const principal = principalFor(request, principals, integratorId, reply);
    if (!principal) return;
    const rotation = await options.integrators.rotateWebhook(integratorId, endpointId);
    if (!rotation) return reply.code(404).send({ error: "Webhook not found" });
    await options.integrators.audit(integratorId, principal.prefix, "webhook.secret_rotated", { endpointId });
    return {
      keyId: rotation.keyId,
      signingSecret: deriveWebhookSecret(options.webhookMasterKey, integratorId, endpointId, rotation.keyId),
      previousSecretValidForSeconds: 86_400,
    };
  });

  app.post("/v1/integrators/:integratorId/webhook-deliveries/:deliveryId/replay", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Webhooks are unavailable" });
    const { integratorId, deliveryId } = DeliveryParamsSchema.parse(request.params);
    if (!principalFor(request, principals, integratorId, reply)) return;
    return (await options.integrators.replayWebhook(integratorId, deliveryId))
      ? reply.code(202).send({ accepted: true })
      : reply.code(404).send({ error: "Dead-letter delivery not found" });
  });

  app.get("/v1/integrators/:integratorId/webhook-deliveries", async (request, reply) => {
    if (!options.integrators) return reply.code(503).send({ error: "Webhooks are unavailable" });
    const { integratorId } = IntegratorParamsSchema.parse(request.params);
    if (!principalFor(request, principals, integratorId, reply)) return;
    const { status } = DeliveryQuerySchema.parse(request.query);
    return options.integrators.listWebhookDeliveries(integratorId, status);
  });

  app.post("/v1/builders/approval-plans", async (request, reply) => {
    if (!options.builder)
      return reply
        .code(404)
        .send({ error: { code: "ATTRIBUTION_DISABLED", message: "Builder attribution is disabled." } });
    const input = BuilderApprovalSchema.parse(request.body);
    const requested = BigInt(input.maxFeeBpsTimes1k);
    if (requested !== options.builder.feeBpsTimes1k) {
      return reply
        .code(400)
        .send({ error: { code: "FEE_MISMATCH", message: "Approve the exact fee displayed by EventRail." } });
    }
    return {
      builder: options.builder.address,
      feeBpsTimes1k: requested.toString(),
      call: createBuilderApprovalCall(input.poolAddress as `0x${string}`, options.builder.address, requested),
    };
  });

  app.get("/v1/markets", async () => []);

  app.get("/v1/data/series", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { network } = EventQuerySchema.parse(request.query);
    const markets = (await options.dataReader.listLiveMarkets()).filter(
      (market) => market.network === network,
    );
    return buildSeries(markets);
  });

  app.get("/v1/data/markets", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { network } = EventQuerySchema.parse(request.query);
    return (await options.dataReader.listLiveMarkets()).filter((market) => market.network === network);
  });

  app.get("/v1/data/markets/:marketId", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    const market = await options.dataReader.getMarket(marketId);
    return market ?? reply.code(404).send({ error: "Market not found" });
  });

  app.get("/v1/data/markets/:marketId/resolution", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    const resolution = await options.dataReader.getResolution(marketId);
    return resolution ?? reply.code(404).send({ error: "Market not found" });
  });

  app.get("/v1/data/markets/:marketId/book", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    const book = await options.dataReader.getOrderBook(marketId, 25);
    return book ?? reply.code(404).send({ error: "Market not found" });
  });

  app.get("/v1/data/markets/:marketId/trades", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    return options.dataReader.getFills(marketId, { limit: 100 });
  });

  app.get("/v1/data/markets/:marketId/candles", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    const { intervalSeconds } = CandleQuerySchema.parse(request.query);
    return options.dataReader.getCandles(marketId, intervalSeconds, { limit: 500 });
  });

  app.get("/v1/data/markets/:marketId/quote", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    const quote = QuoteQuerySchema.parse(request.query);
    const book = await options.dataReader.getOrderBook(marketId, 100);
    if (!book) return reply.code(404).send({ error: "Market not found" });
    return quoteExecutableDepth(book, quote);
  });

  app.post("/v1/trading/quotes", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const input = TradeQuoteRequestSchema.parse(request.body);
    // Fastify's request signal follows IncomingMessage.close, which can fire
    // once a proxied POST body is consumed even though the response is still
    // being prepared. Adapter reads have their own bounded RPC resilience, so
    // they must not inherit that prematurely-aborted signal.
    const [market, book, parameters] = await Promise.all([
      options.dataReader.getMarket(input.marketId),
      options.dataReader.getOrderBook(input.marketId, 100),
      options.dataReader.getBookParameters(input.marketId),
    ]);
    if (!market || !book || !parameters) return reply.code(404).send({ error: "Market not found" });
    try {
      return calculateTradeQuote(market, book, {
        outcome: input.outcome,
        side: input.side,
        mode: input.mode,
        amount: input.amount,
        tickSize: parameters.tickSize,
        lotSize: parameters.lotSize,
        minimumQuantity: parameters.minimumQuantity,
        feeBps: input.feeBps,
        maxSlippageBps: input.maxSlippageBps,
        minimumFillBps: input.minimumFillBps,
        minimumTimeRemainingSeconds: input.minimumTimeRemainingSeconds,
        ...(input.availableBalance === undefined
          ? {}
          : input.side === "buy"
            ? { collateralBalance: input.availableBalance }
            : { outcomeBalance: input.availableBalance }),
      });
    } catch (error) {
      if (error instanceof QuoteError) {
        return reply.code(error.recoverable ? 409 : 400).send({
          error: { code: error.code, message: error.message, recoverable: error.recoverable },
        });
      }
      throw error;
    }
  });

  app.post("/v1/trading/plans", async (request, reply) => {
    if (!options.dataReader || !options.tradePlanner) {
      return reply.code(503).send({ error: "Trade planning is unavailable" });
    }
    const input = TradePlanRequestSchema.parse(request.body);
    const [market, book, parameters] = await Promise.all([
      options.dataReader.getMarket(input.quote.marketId),
      options.dataReader.getOrderBook(input.quote.marketId, 100),
      options.dataReader.getBookParameters(input.quote.marketId),
    ]);
    if (!market || !book || !parameters) return reply.code(404).send({ error: "Market not found" });
    if (market.poolAddress.toLowerCase() !== input.quote.poolAddress.toLowerCase()) {
      return reply.code(409).send({ error: "Market rolled over; request a new quote" });
    }
    try {
      const refreshed = calculateTradeQuote(market, book, {
        outcome: input.quote.outcome,
        side: input.quote.side,
        mode: input.quote.mode,
        amount: input.quote.requestedAmount,
        tickSize: parameters.tickSize,
        lotSize: parameters.lotSize,
        minimumQuantity: parameters.minimumQuantity,
        feeBps: inferFeeBps(input.quote.notional, input.quote.fee),
        maxSlippageBps: input.policy.maxSlippageBps,
        minimumFillBps: input.policy.minimumFillBps,
        minimumTimeRemainingSeconds: input.policy.minimumTimeRemainingSeconds,
      });
      assertQuoteStillExecutable(input.quote, refreshed);
      const capability =
        input.builderFeeApproved && options.builder
          ? await options.builder.getCapability({
              account: input.account as `0x${string}`,
              pool: market.poolAddress as `0x${string}`,
              builder: options.builder.address,
            })
          : null;
      return await options.tradePlanner.create({
        idempotencyKey: input.idempotencyKey,
        chainId: market.network === "shannon" ? 50_312 : 5_031,
        account: input.account as `0x${string}`,
        collateralAddress: market.collateralAddress as `0x${string}`,
        outcomeTokenAddress: market.outcomeTokenAddress as `0x${string}`,
        upTokenId: market.upTokenId,
        downTokenId: market.downTokenId,
        quote: input.quote,
        policy: input.policy,
        builder: {
          requested: input.builderFeeApproved,
          ...(options.builder
            ? {
                address: options.builder.address,
                feeBpsTimes1k: options.builder.feeBpsTimes1k,
                capability,
              }
            : {}),
        },
      });
    } catch (error) {
      if (error instanceof PlanConflictError) {
        return reply.code(409).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof QuoteError) {
        return reply
          .code(409)
          .send({ error: { code: error.code, message: error.message, recoverable: true } });
      }
      throw error;
    }
  });

  app.post("/v1/funding/routes", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX funding is unavailable" });
    const input = FundingRouteRequestSchema.parse(request.body);
    const route = await options.dataReader.getUsdsoFundingRoute({
      account: input.account as `0x${string}`,
      targetOutputQuantity: input.targetOutputQuantity,
      maxSlippageBps: input.maxSlippageBps,
    });
    return (
      route ??
      reply.code(409).send({
        error: {
          code: "USDso_ROUTE_UNAVAILABLE",
          message: "No sufficiently deep SOMI/USDso DreamDEX spot route is currently available.",
          recoverable: true,
        },
      })
    );
  });

  app.post("/v1/trading/submissions", async (request, reply) => {
    if (!options.submissionStore) return reply.code(503).send({ error: "Receipt tracking is unavailable" });
    const input = TradeSubmissionSchema.parse(request.body);
    try {
      await options.submissionStore.recordSubmission(input);
      return reply.code(202).send({ accepted: true });
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : "Submission rejected" });
    }
  });

  app.get("/v1/data/accounts/:account/positions", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { account } = AccountParamsSchema.parse(request.params);
    const snapshot = await options.dataReader.getPortfolioSnapshot(account);
    return options.portfolioStore
      ? options.portfolioStore.reconcile("shannon", account, snapshot)
      : snapshot.positions;
  });

  app.get("/v1/data/accounts/:account/activity", async (request, reply) => {
    if (!options.activityReader) return reply.code(503).send({ error: "Activity history is unavailable" });
    const { account } = AccountParamsSchema.parse(request.params);
    const query = ActivityQuerySchema.parse(request.query);
    return options.activityReader.list({
      network: query.network,
      account,
      limit: query.limit,
      ...(query.marketId ? { marketId: query.marketId } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  });

  app.get("/v1/data/accounts/:account/claims", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { account } = AccountParamsSchema.parse(request.params);
    return options.dataReader.getClaims(account);
  });

  app.post("/v1/redemptions/plans", async (request, reply) => {
    if (!options.dataReader || !options.redemption) {
      return reply.code(503).send({ error: "Redemption planning is unavailable" });
    }
    const input = RedemptionPlanRequestSchema.parse(request.body);
    const snapshot = await options.dataReader.getPortfolioSnapshot(input.account);
    const positions = snapshot.positions.filter(
      (position) => position.marketId.toLowerCase() === input.marketId.toLowerCase(),
    );
    try {
      return RedemptionPlanSchema.parse(
        createRedemptionPlan({
          account: input.account as `0x${string}`,
          chainId: options.redemption.chainId,
          moduleAddress: options.redemption.moduleAddress,
          positions,
        }),
      );
    } catch (error) {
      if (error instanceof RedemptionPlanError) {
        return reply.code(409).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get("/v1/data/accounts/:account/balances/:marketId", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { account, marketId } = BalanceParamsSchema.parse(request.params);
    const balances = await options.dataReader.getOutcomeBalances(account, marketId);
    return balances ?? reply.code(404).send({ error: "Market not found" });
  });

  app.get("/v1/events", async (request, reply) => {
    if (!options.eventStream) return reply.code(503).send({ error: "Event stream is unavailable" });
    const query = EventQuerySchema.parse(request.query);
    const headerCursor = request.headers["last-event-id"];
    const cursor = Array.isArray(headerCursor) ? headerCursor[0] : headerCursor;
    const controller = new AbortController();
    request.raw.once("close", () => controller.abort());
    const origin = request.headers.origin;
    const streamCorsHeaders = origin && options.allowedOrigins?.includes(origin) ? corsHeaders(origin) : {};
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...streamCorsHeaders,
    });
    reply.raw.write("retry: 2000\n\n");
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), options.heartbeatMs ?? 15_000);
    heartbeat.unref();
    try {
      for await (const record of options.eventStream.subscribe({
        network: query.network,
        ...(cursor ? { cursor } : {}),
        signal: controller.signal,
      })) {
        reply.raw.write(formatSseRecord(record));
      }
    } finally {
      clearInterval(heartbeat);
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  });

  return app;
}

function corsHeaders(origin: string) {
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
  };
}

export function formatSseRecord(record: EventBusRecord): string {
  return `id: ${record.cursor}\nevent: ${record.event.type}\ndata: ${JSON.stringify(record.event)}\n\n`;
}

export function buildSeries(markets: readonly NormalizedMarket[]): readonly MarketSeries[] {
  const grouped = new Map<string, NormalizedMarket[]>();
  for (const market of markets) {
    const rows = grouped.get(market.cadence.seriesKey) ?? [];
    rows.push(market);
    grouped.set(market.cadence.seriesKey, rows);
  }
  return [...grouped.entries()].map(([seriesKey, generations]) => {
    const sorted = generations.sort(
      (left, right) => Date.parse(right.tradingStart) - Date.parse(left.tradingStart),
    );
    const current = sorted[0];
    if (!current) throw new Error(`Series ${seriesKey} has no current market`);
    return MarketSeriesSchema.parse({
      network: current.network,
      venue: "dreamdex",
      seriesKey,
      asset: current.asset,
      intervalSeconds: current.cadence.intervalSeconds,
      currentMarketId: current.marketId,
      currentStatus: current.status,
      generationCount: generations.length.toString(),
      freshness: current.freshness,
    });
  });
}

function inferFeeBps(notionalValue: string, feeValue: string): number {
  const notional = BigInt(notionalValue);
  const fee = BigInt(feeValue);
  if (fee === 0n) return 0;
  if (notional === 0n) throw new QuoteError("INVALID_INPUT", "A fee cannot exist without notional.", false);
  const candidate = Number(((fee - 1n) * 10_000n) / notional + 1n);
  if (candidate < 0 || candidate > 10_000 || (notional * BigInt(candidate) + 9_999n) / 10_000n !== fee) {
    throw new QuoteError("INVALID_INPUT", "The quote fee policy is inconsistent.", false);
  }
  return candidate;
}

function assertQuoteStillExecutable(
  original: z.infer<typeof TradeQuoteSchema>,
  refreshed: z.infer<typeof TradeQuoteSchema>,
) {
  const fields = [
    "network",
    "marketId",
    "poolAddress",
    "outcome",
    "side",
    "mode",
    "requestedAmount",
    "quantity",
    "minimumFillQuantity",
    "notional",
    "fee",
    "maximumCost",
    "minimumReceive",
    "limitPrice",
    "tickSize",
    "lotSize",
    "sourceBlock",
  ] as const;
  if (fields.some((field) => original[field] !== refreshed[field])) {
    throw new QuoteError(
      "STALE_BOOK",
      "The executable quote no longer matches authoritative DreamDEX depth.",
      true,
    );
  }
}

function principalFor(
  request: object,
  principals: WeakMap<object, ApiKeyRecord>,
  integratorId: string,
  reply: { code(status: number): { send(payload: unknown): unknown } },
): ApiKeyRecord | null {
  const principal = principals.get(request);
  if (!principal) {
    reply.code(401).send({ error: { code: "INVALID_KEY", message: "An API key is required." } });
    return null;
  }
  if (principal.integratorId !== integratorId) {
    reply
      .code(403)
      .send({ error: { code: "TENANT_DENIED", message: "The API key cannot access this integrator." } });
    return null;
  }
  return principal;
}
