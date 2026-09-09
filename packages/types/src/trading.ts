import { z } from "zod";
import {
  AddressSchema,
  Bytes32Schema,
  IsoDateTimeSchema,
  MarketOutcomeSchema,
  SomniaNetworkSchema,
  UnsignedIntegerStringSchema,
} from "./data.js";

export const TradeQuoteSchema = z.object({
  version: z.literal("1"),
  network: SomniaNetworkSchema,
  venue: z.literal("dreamdex"),
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  collateralDecimals: z.number().int().min(0).max(36),
  outcome: MarketOutcomeSchema,
  side: z.enum(["buy", "sell"]),
  mode: z.enum(["spend", "quantity"]),
  requestedAmount: UnsignedIntegerStringSchema,
  quantity: UnsignedIntegerStringSchema,
  availableQuantity: UnsignedIntegerStringSchema,
  minimumFillQuantity: UnsignedIntegerStringSchema,
  notional: UnsignedIntegerStringSchema,
  fee: UnsignedIntegerStringSchema,
  total: UnsignedIntegerStringSchema,
  maximumCost: UnsignedIntegerStringSchema,
  minimumReceive: UnsignedIntegerStringSchema,
  averagePrice: UnsignedIntegerStringSchema,
  worstPrice: UnsignedIntegerStringSchema,
  limitPrice: UnsignedIntegerStringSchema,
  priceImpactBps: UnsignedIntegerStringSchema,
  spread: z
    .string()
    .regex(/^-?(0|[1-9][0-9]*)$/)
    .nullable(),
  tickSize: UnsignedIntegerStringSchema,
  lotSize: UnsignedIntegerStringSchema,
  sourceBlock: UnsignedIntegerStringSchema,
  observedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  marketExpiresAt: IsoDateTimeSchema,
  warnings: z.array(z.string()),
});

export type TradeQuote = z.infer<typeof TradeQuoteSchema>;

export const PlanPolicySchema = z.object({
  maxSlippageBps: z.number().int().min(0).max(10_000),
  minimumFillBps: z.number().int().min(0).max(10_000),
  minimumTimeRemainingSeconds: z.number().int().nonnegative(),
  quoteSourceBlock: UnsignedIntegerStringSchema,
  quoteExpiresAt: IsoDateTimeSchema,
});

export const PlannedCallSchema = z.object({
  kind: z.enum(["approval", "order", "funding", "redemption"]),
  to: AddressSchema,
  data: z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/),
  value: UnsignedIntegerStringSchema,
  gas: UnsignedIntegerStringSchema,
  description: z.string().min(1),
  requiresConfirmation: z.boolean(),
});

export const TradePlanSchema = z.object({
  version: z.literal("1"),
  planId: z.uuid(),
  planHash: Bytes32Schema,
  network: SomniaNetworkSchema,
  chainId: z.number().int().positive(),
  account: AddressSchema,
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  collateralAddress: AddressSchema,
  outcomeTokenAddress: AddressSchema,
  outcome: MarketOutcomeSchema,
  side: z.enum(["buy", "sell"]),
  yesTermsPrice: UnsignedIntegerStringSchema,
  quantity: UnsignedIntegerStringSchema,
  orderType: z.literal("ioc"),
  orderExpiryNs: UnsignedIntegerStringSchema,
  quote: TradeQuoteSchema,
  policy: PlanPolicySchema,
  calls: z.array(PlannedCallSchema).min(1),
  summary: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
});

export type PlanPolicy = z.infer<typeof PlanPolicySchema>;
export type PlannedCall = z.infer<typeof PlannedCallSchema>;
export type TradePlan = z.infer<typeof TradePlanSchema>;

export const PlanSimulationSchema = z.object({
  callIndex: z.number().int().nonnegative(),
  kind: PlannedCallSchema.shape.kind,
  gasLimit: UnsignedIntegerStringSchema,
  estimatedGas: UnsignedIntegerStringSchema.nullable(),
});

export const PlanVerificationSchema = z.object({
  ok: z.literal(true),
  planId: z.uuid(),
  planHash: Bytes32Schema,
  checkedAt: IsoDateTimeSchema,
  sourceBlock: UnsignedIntegerStringSchema,
  simulations: z.array(PlanSimulationSchema),
});

export type PlanSimulation = z.infer<typeof PlanSimulationSchema>;
export type PlanVerification = z.infer<typeof PlanVerificationSchema>;

export const TradeExecutionStateSchema = z.enum([
  "planned",
  "wallet_pending",
  "submitted",
  "confirmed",
  "filled",
  "partially_filled",
  "unfilled",
  "reverted",
  "expired",
  "invalidated",
]);

export const TradeExecutionSchema = z.object({
  planId: z.uuid(),
  planHash: Bytes32Schema,
  network: SomniaNetworkSchema,
  account: AddressSchema,
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  transactionHash: Bytes32Schema,
  state: TradeExecutionStateSchema,
  requestedQuantity: UnsignedIntegerStringSchema,
  filledQuantity: UnsignedIntegerStringSchema,
  realizedQuoteQuantity: UnsignedIntegerStringSchema,
  realizedAveragePrice: UnsignedIntegerStringSchema.nullable(),
  blockNumber: UnsignedIntegerStringSchema.nullable(),
  errorCode: z.string().nullable(),
  observedAt: IsoDateTimeSchema,
});

export type TradeExecutionState = z.infer<typeof TradeExecutionStateSchema>;
export type TradeExecution = z.infer<typeof TradeExecutionSchema>;

export const TradeActivitySchema = z.object({
  planId: z.uuid(),
  planHash: Bytes32Schema,
  network: SomniaNetworkSchema,
  account: AddressSchema,
  marketId: Bytes32Schema,
  activityType: z.literal("trade"),
  outcome: MarketOutcomeSchema,
  side: z.enum(["buy", "sell"]),
  state: TradeExecutionStateSchema,
  quotedQuantity: UnsignedIntegerStringSchema,
  quotedPrice: UnsignedIntegerStringSchema,
  quotedMaximumCost: UnsignedIntegerStringSchema,
  realizedQuantity: UnsignedIntegerStringSchema,
  realizedAveragePrice: UnsignedIntegerStringSchema.nullable(),
  transactionHash: Bytes32Schema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type TradeActivity = z.infer<typeof TradeActivitySchema>;

export const FundingRouteSchema = z.object({
  version: z.literal("1"),
  network: SomniaNetworkSchema,
  venue: z.literal("dreamdex-spot"),
  account: AddressSchema,
  poolAddress: AddressSchema,
  inputToken: AddressSchema,
  outputToken: AddressSchema,
  inputSymbol: z.string().min(1),
  outputSymbol: z.literal("USDso"),
  inputDecimals: z.number().int().min(0).max(36),
  outputDecimals: z.number().int().min(0).max(36),
  inputQuantity: UnsignedIntegerStringSchema,
  targetOutputQuantity: UnsignedIntegerStringSchema,
  minimumOutputQuantity: UnsignedIntegerStringSchema,
  limitPrice: UnsignedIntegerStringSchema,
  source: z.literal("DreamDEX spot order book"),
  sourceBlock: UnsignedIntegerStringSchema,
  expiresAt: IsoDateTimeSchema,
  calls: z.array(PlannedCallSchema).min(1),
});

export type FundingRoute = z.infer<typeof FundingRouteSchema>;
