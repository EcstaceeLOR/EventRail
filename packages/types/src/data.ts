import { z } from "zod";

export const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const Bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const TransactionHashSchema = Bytes32Schema;
export const UnsignedIntegerStringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const SignedIntegerStringSchema = z.string().regex(/^-?(0|[1-9][0-9]*)$/);
export const DecimalStringSchema = z.string().regex(/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const SomniaNetworkSchema = z.enum(["shannon", "mainnet"]);
export const MarketStatusSchema = z.enum(["listed", "trading", "locked", "settling", "resolved", "voided"]);
export const MarketOutcomeSchema = z.enum(["up", "down"]);
export const MarketCadenceSchema = z.object({
  intervalSeconds: UnsignedIntegerStringSchema,
  seriesKey: z.string().min(1),
});

export const DataFreshnessSchema = z.object({
  sourceBlock: UnsignedIntegerStringSchema,
  observedAt: IsoDateTimeSchema,
  staleAt: IsoDateTimeSchema,
  authoritative: z.boolean(),
  state: z.enum(["fresh", "stale", "offline"]),
});

export const MarketResolutionSchema = z.object({
  state: z.enum(["unresolved", "resolved", "voided"]),
  winningOutcome: MarketOutcomeSchema.nullable(),
  openingPrice: DecimalStringSchema.nullable(),
  resolutionPrice: DecimalStringSchema.nullable(),
  payoutUp: UnsignedIntegerStringSchema.nullable(),
  payoutDown: UnsignedIntegerStringSchema.nullable(),
  payoutDenominator: UnsignedIntegerStringSchema.nullable(),
});

export const NormalizedMarketSchema = z.object({
  network: SomniaNetworkSchema,
  venue: z.literal("dreamdex"),
  marketId: Bytes32Schema,
  marketAddress: AddressSchema,
  poolAddress: AddressSchema,
  poolNonce: UnsignedIntegerStringSchema,
  collateralAddress: AddressSchema,
  collateralDecimals: z.number().int().min(0).max(36),
  outcomeTokenAddress: AddressSchema,
  upTokenId: UnsignedIntegerStringSchema,
  downTokenId: UnsignedIntegerStringSchema,
  question: z.string().min(1),
  asset: z.string().min(1),
  oracle: z.string().min(1),
  status: MarketStatusSchema,
  tradingStart: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  cadence: MarketCadenceSchema,
  lastPrice: DecimalStringSchema.nullable(),
  cumulativeQuoteVolume: UnsignedIntegerStringSchema,
  backing: UnsignedIntegerStringSchema,
  finalized: z.boolean(),
  resolution: MarketResolutionSchema,
  freshness: DataFreshnessSchema,
});

export const OrderBookLevelSchema = z.object({
  price: UnsignedIntegerStringSchema,
  quantity: UnsignedIntegerStringSchema,
});

export const NormalizedOrderBookSchema = z.object({
  network: SomniaNetworkSchema,
  venue: z.literal("dreamdex"),
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  collateralDecimals: z.number().int().min(0).max(36),
  upBids: z.array(OrderBookLevelSchema),
  upAsks: z.array(OrderBookLevelSchema),
  downBids: z.array(OrderBookLevelSchema),
  downAsks: z.array(OrderBookLevelSchema),
  freshness: DataFreshnessSchema,
});

export const NormalizedFillSchema = z.object({
  network: SomniaNetworkSchema,
  venue: z.literal("dreamdex"),
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  transactionHash: TransactionHashSchema,
  logIndex: UnsignedIntegerStringSchema,
  blockNumber: UnsignedIntegerStringSchema,
  timestamp: IsoDateTimeSchema,
  outcome: MarketOutcomeSchema,
  side: z.enum(["buy", "sell"]),
  price: UnsignedIntegerStringSchema,
  quantity: UnsignedIntegerStringSchema,
  quoteQuantity: UnsignedIntegerStringSchema,
  maker: AddressSchema.nullable(),
  taker: AddressSchema.nullable(),
});

export const NormalizedCandleSchema = z.object({
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  intervalSeconds: UnsignedIntegerStringSchema,
  timestamp: IsoDateTimeSchema,
  open: UnsignedIntegerStringSchema,
  high: UnsignedIntegerStringSchema,
  low: UnsignedIntegerStringSchema,
  close: UnsignedIntegerStringSchema,
  baseVolume: UnsignedIntegerStringSchema,
  quoteVolume: UnsignedIntegerStringSchema,
  tradeCount: UnsignedIntegerStringSchema,
});

export const NormalizedPositionSchema = z.object({
  account: AddressSchema,
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  outcome: MarketOutcomeSchema,
  balance: UnsignedIntegerStringSchema,
  averageEntryPrice: UnsignedIntegerStringSchema.nullable(),
  realizedPnl: SignedIntegerStringSchema,
  unrealizedPnl: SignedIntegerStringSchema,
  freshness: DataFreshnessSchema,
});

export const NormalizedClaimSchema = z.object({
  account: AddressSchema,
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  outcome: MarketOutcomeSchema,
  amount: UnsignedIntegerStringSchema,
  estimatedPayout: UnsignedIntegerStringSchema,
  status: z.enum(["claimable", "claimed", "unavailable"]),
  freshness: DataFreshnessSchema,
});

export const OutcomeBalancesSchema = z.object({
  account: AddressSchema,
  marketId: Bytes32Schema,
  marketAddress: AddressSchema,
  up: UnsignedIntegerStringSchema,
  down: UnsignedIntegerStringSchema,
  freshness: DataFreshnessSchema,
});

export const ResolutionSnapshotSchema = z.object({
  marketId: Bytes32Schema,
  resolution: MarketResolutionSchema,
  eventCount: UnsignedIntegerStringSchema,
  freshness: DataFreshnessSchema,
});

export const ExecutableQuoteSchema = z.object({
  marketId: Bytes32Schema,
  outcome: MarketOutcomeSchema,
  side: z.enum(["buy", "sell"]),
  requestedQuantity: UnsignedIntegerStringSchema,
  filledQuantity: UnsignedIntegerStringSchema,
  availableQuantity: UnsignedIntegerStringSchema,
  minimumFillQuantity: UnsignedIntegerStringSchema,
  quoteQuantity: UnsignedIntegerStringSchema,
  averagePrice: UnsignedIntegerStringSchema.nullable(),
  worstPrice: UnsignedIntegerStringSchema.nullable(),
  priceImpactBps: UnsignedIntegerStringSchema.nullable(),
  spread: SignedIntegerStringSchema.nullable(),
  complete: z.boolean(),
  freshness: DataFreshnessSchema,
});

export const DataEventTypeSchema = z.enum([
  "market.updated",
  "book.updated",
  "fill.created",
  "market.rolled-over",
  "market.settled",
  "position.updated",
  "claim.updated",
]);

export const DataStreamEventSchema = z.object({
  version: z.literal("1"),
  type: DataEventTypeSchema,
  eventId: z.string().min(1),
  sequence: UnsignedIntegerStringSchema,
  network: SomniaNetworkSchema,
  venue: z.literal("dreamdex"),
  marketId: Bytes32Schema,
  sourceBlock: UnsignedIntegerStringSchema,
  logIndex: UnsignedIntegerStringSchema.nullable(),
  observedAt: IsoDateTimeSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type DataFreshness = z.infer<typeof DataFreshnessSchema>;
export type SomniaNetwork = z.infer<typeof SomniaNetworkSchema>;
export type NormalizedMarket = z.infer<typeof NormalizedMarketSchema>;
export type NormalizedOrderBook = z.infer<typeof NormalizedOrderBookSchema>;
export type NormalizedFill = z.infer<typeof NormalizedFillSchema>;
export type NormalizedCandle = z.infer<typeof NormalizedCandleSchema>;
export type NormalizedPosition = z.infer<typeof NormalizedPositionSchema>;
export type NormalizedClaim = z.infer<typeof NormalizedClaimSchema>;
export type OutcomeBalances = z.infer<typeof OutcomeBalancesSchema>;
export type ResolutionSnapshot = z.infer<typeof ResolutionSnapshotSchema>;
export type ExecutableQuote = z.infer<typeof ExecutableQuoteSchema>;
export type DataStreamEvent = z.infer<typeof DataStreamEventSchema>;
