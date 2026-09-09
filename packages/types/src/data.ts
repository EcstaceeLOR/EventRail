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

export const OracleEvidenceSchema = z.object({
  marketId: Bytes32Schema,
  question: z.string().min(1),
  closingQuestionId: UnsignedIntegerStringSchema.nullable(),
  openingQuestionId: UnsignedIntegerStringSchema.nullable(),
  openingValue: DecimalStringSchema.nullable(),
  closingValue: DecimalStringSchema.nullable(),
  resolutionTransactionHash: TransactionHashSchema.nullable(),
  closingOracleTransactionHash: TransactionHashSchema.nullable(),
  openingOracleTransactionHash: TransactionHashSchema.nullable(),
  graphUrl: z.url().nullable(),
  explorerUrl: z.url().nullable(),
  state: z.enum(["available", "pending", "unavailable"]),
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

export const BookParametersSchema = z.object({
  marketId: Bytes32Schema,
  poolAddress: AddressSchema,
  tickSize: UnsignedIntegerStringSchema,
  lotSize: UnsignedIntegerStringSchema,
  minimumQuantity: UnsignedIntegerStringSchema,
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
  evidence: OracleEvidenceSchema.nullable().default(null),
  freshness: DataFreshnessSchema,
});

export const MarketSeriesSchema = z.object({
  network: SomniaNetworkSchema,
  venue: z.literal("dreamdex"),
  seriesKey: z.string().min(1),
  asset: z.string().min(1),
  intervalSeconds: UnsignedIntegerStringSchema,
  currentMarketId: Bytes32Schema,
  currentStatus: MarketStatusSchema,
  generationCount: UnsignedIntegerStringSchema,
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
  "transaction.updated",
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
export type MarketResolution = z.infer<typeof MarketResolutionSchema>;
export type OracleEvidence = z.infer<typeof OracleEvidenceSchema>;
export type SomniaNetwork = z.infer<typeof SomniaNetworkSchema>;
export type NormalizedMarket = z.infer<typeof NormalizedMarketSchema>;
export type NormalizedOrderBook = z.infer<typeof NormalizedOrderBookSchema>;
export type BookParameters = z.infer<typeof BookParametersSchema>;
export type NormalizedFill = z.infer<typeof NormalizedFillSchema>;
export type NormalizedCandle = z.infer<typeof NormalizedCandleSchema>;
export type NormalizedPosition = z.infer<typeof NormalizedPositionSchema>;

export const PortfolioPositionSchema = z.object({
  account: AddressSchema,
  network: SomniaNetworkSchema,
  marketId: Bytes32Schema,
  marketAddress: AddressSchema,
  poolAddress: AddressSchema,
  outcomeTokenAddress: AddressSchema,
  tokenId: UnsignedIntegerStringSchema,
  outcome: MarketOutcomeSchema,
  question: z.string().min(1),
  asset: z.string().min(1),
  cadence: MarketCadenceSchema,
  status: MarketStatusSchema,
  expiresAt: IsoDateTimeSchema,
  collateralDecimals: z.number().int().min(0).max(36),
  balance: UnsignedIntegerStringSchema,
  indexedBalance: UnsignedIntegerStringSchema,
  costBasis: UnsignedIntegerStringSchema,
  averageEntryPrice: UnsignedIntegerStringSchema.nullable(),
  markPrice: UnsignedIntegerStringSchema.nullable(),
  markValue: UnsignedIntegerStringSchema.nullable(),
  realizedPnl: SignedIntegerStringSchema,
  unrealizedPnl: SignedIntegerStringSchema.nullable(),
  settlementPayout: UnsignedIntegerStringSchema,
  redeemedQuantity: UnsignedIntegerStringSchema,
  redemptionPayout: UnsignedIntegerStringSchema,
  claimStatus: z.enum(["pending", "claimable", "claimed", "no_value"]),
  valuationAssumptions: z.array(z.string().min(1)),
  resolution: MarketResolutionSchema,
  oracleEvidence: OracleEvidenceSchema.nullable().default(null),
  freshness: DataFreshnessSchema,
});

export const PortfolioSummarySchema = z.object({
  account: AddressSchema,
  collateralDecimals: z.number().int().min(0).max(36).nullable(),
  totalCostBasis: UnsignedIntegerStringSchema,
  totalMarkValue: UnsignedIntegerStringSchema.nullable(),
  totalRealizedPnl: SignedIntegerStringSchema,
  totalUnrealizedPnl: SignedIntegerStringSchema.nullable(),
  claimablePayout: UnsignedIntegerStringSchema,
  openPositionCount: UnsignedIntegerStringSchema,
  lockedPositionCount: UnsignedIntegerStringSchema,
});

export const PortfolioSnapshotSchema = z.object({
  account: AddressSchema,
  positions: z.array(PortfolioPositionSchema),
  freshness: DataFreshnessSchema,
});

export const ClaimCandidateSchema = z.object({
  network: SomniaNetworkSchema,
  account: AddressSchema,
  marketId: Bytes32Schema,
  outcome: MarketOutcomeSchema,
  tokenId: UnsignedIntegerStringSchema,
  amount: UnsignedIntegerStringSchema,
  estimatedPayout: UnsignedIntegerStringSchema,
  status: z.enum(["claimable", "no_value"]),
  expiresAt: IsoDateTimeSchema,
  resolution: MarketResolutionSchema,
  freshness: DataFreshnessSchema,
});

export type PortfolioPosition = z.infer<typeof PortfolioPositionSchema>;
export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;
export type ClaimCandidate = z.infer<typeof ClaimCandidateSchema>;
export type NormalizedClaim = z.infer<typeof NormalizedClaimSchema>;
export type OutcomeBalances = z.infer<typeof OutcomeBalancesSchema>;
export type ResolutionSnapshot = z.infer<typeof ResolutionSnapshotSchema>;
export type MarketSeries = z.infer<typeof MarketSeriesSchema>;
export type ExecutableQuote = z.infer<typeof ExecutableQuoteSchema>;
export type DataStreamEvent = z.infer<typeof DataStreamEventSchema>;
