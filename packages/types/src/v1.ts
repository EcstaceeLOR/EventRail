import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });
const address = z.templateLiteral(["0x", z.string().regex(/^[0-9a-fA-F]{40}$/)]);
const hexData = z.templateLiteral(["0x", z.string().regex(/^(?:[0-9a-fA-F]{2})*$/)]);
const hash = z.templateLiteral(["0x", z.string().regex(/^[0-9a-fA-F]{64}$/)]);
const decimalString = z.string().regex(/^\d+(?:\.\d+)?$/);

export const NetworkSchema = z.enum(["shannon", "mainnet"]);
export type Network = z.infer<typeof NetworkSchema>;

export const MarketPhaseSchema = z.enum(["trading", "paused", "resolving", "resolved", "voided"]);
export type MarketPhase = z.infer<typeof MarketPhaseSchema>;

export const FreshnessSchema = z.object({
  observedAt: isoDateTime,
  sourceBlock: z.int().nonnegative(),
  indexedBlock: z.int().nonnegative().optional(),
  staleAfter: isoDateTime,
});
export type Freshness = z.infer<typeof FreshnessSchema>;

export const EventMarketSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  question: z.string().min(1),
  category: z.string().min(1),
  phase: MarketPhaseSchema,
  yesPrice: z.number().min(0).max(1),
  noPrice: z.number().min(0).max(1),
  volumeUsd: z.number().nonnegative(),
  liquidityUsd: z.number().nonnegative(),
  closesAt: isoDateTime,
  network: NetworkSchema.optional(),
  freshness: FreshnessSchema.optional(),
});
export type EventMarket = z.infer<typeof EventMarketSchema>;

export const PageInfoSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
  hasNextPage: z.boolean(),
});

export const MarketPageSchema = z.object({
  data: z.array(EventMarketSchema),
  page: PageInfoSchema,
});
export type MarketPage = z.infer<typeof MarketPageSchema>;

export const ApiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "STALE_MARKET_STATE",
  "PLAN_EXPIRED",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
    recoverable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export const TransactionCallSchema = z.object({
  to: address,
  data: hexData,
  value: decimalString,
});

export const TransactionPlanSchema = z.object({
  version: z.literal("1"),
  planId: z.uuid(),
  planHash: hash,
  network: NetworkSchema,
  chainId: z.int().positive(),
  account: address,
  calls: z.array(TransactionCallSchema).min(1),
  summary: z.string().min(1),
  sourceBlock: z.int().nonnegative(),
  observedAt: isoDateTime,
  expiresAt: isoDateTime,
  assumptions: z.array(z.string().min(1)),
  expectedEffects: z.array(z.string().min(1)),
});
export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;

export const TradePlanRequestSchema = z.object({
  marketId: z.string().min(1),
  outcome: z.enum(["yes", "no"]),
  amountUsdso: decimalString,
  account: address,
  maxSlippageBps: z.int().min(0).max(10_000).default(100),
});
export type TradePlanRequest = z.input<typeof TradePlanRequestSchema>;

const streamBase = z.object({
  version: z.literal("1"),
  eventId: z.string().min(1),
  sequence: z.int().nonnegative(),
  network: NetworkSchema,
  marketId: z.string().min(1),
  sourceBlock: z.int().nonnegative(),
  observedAt: isoDateTime,
});

export const StreamEventSchema = z.discriminatedUnion("type", [
  streamBase.extend({ type: z.literal("market.updated"), payload: EventMarketSchema }),
  streamBase.extend({
    type: z.literal("book.updated"),
    payload: z.object({
      bestBid: z.number().min(0).max(1).nullable(),
      bestAsk: z.number().min(0).max(1).nullable(),
    }),
  }),
  streamBase.extend({
    type: z.literal("trade.confirmed"),
    payload: z.object({ transactionHash: hash, planId: z.uuid().optional() }),
  }),
  streamBase.extend({
    type: z.literal("settlement.updated"),
    payload: z.object({ phase: MarketPhaseSchema, winningOutcome: z.enum(["yes", "no"]).nullable() }),
  }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;

export const HealthStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string().min(1),
  version: z.string().min(1),
  timestamp: isoDateTime,
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
