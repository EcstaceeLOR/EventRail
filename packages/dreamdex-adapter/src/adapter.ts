import {
  ContractRevertError,
  IndexerError,
  InvalidInputError,
  RpcError,
  SomniaMarkets,
  type BinaryMarket,
  type BinaryOrderBook,
  type Candle,
  type ClaimablePosition,
  type FillRow,
  type OpenPositionPnL,
  type SomniaMarketsClient,
} from "@somnia-chain/markets-sdk";
import type { Address, Hex } from "viem";
import {
  DataFreshnessSchema,
  NormalizedCandleSchema,
  NormalizedClaimSchema,
  NormalizedFillSchema,
  NormalizedMarketSchema,
  NormalizedOrderBookSchema,
  NormalizedPositionSchema,
  OutcomeBalancesSchema,
  ResolutionSnapshotSchema,
  type DataFreshness,
  type NormalizedCandle,
  type NormalizedClaim,
  type NormalizedFill,
  type NormalizedMarket,
  type NormalizedOrderBook,
  type NormalizedPosition,
  type OutcomeBalances,
  type ResolutionSnapshot,
  type SomniaNetwork,
} from "@eventrail/types";
import {
  getDreamDexRegistry,
  resolveMarketBinding,
  type DreamDexContractRegistry,
  type ResolvedMarketBinding,
} from "./registry.js";
import { createResilientRpcRouter } from "./resilience.js";

type MarketResolutionRead = Awaited<ReturnType<SomniaMarketsClient["getMarketResolution"]>>;

export type DreamDexSdkReadClient = Pick<
  SomniaMarketsClient,
  | "listLiveBinaryMarkets"
  | "listPastBinaryMarkets"
  | "getBinaryMarket"
  | "getBinaryOrderBook"
  | "getMarketOnchain"
  | "getFills"
  | "getCandles"
  | "getOpeningPrices"
  | "getResolutionPrices"
  | "getMarketResolution"
  | "getOnchainResolutionPrice"
  | "getOpenPositionsWithPnL"
  | "getClaimable"
  | "getOutcomeBalances"
>;

export interface DreamDexChainReader {
  getBlockNumber(): Promise<bigint>;
}

export interface DreamDexReadAdapter {
  listLiveMarkets(signal?: AbortSignal): Promise<readonly NormalizedMarket[]>;
  listHistoricalMarkets(options?: HistoryOptions): Promise<readonly NormalizedMarket[]>;
  getMarket(marketId: string, signal?: AbortSignal): Promise<NormalizedMarket | null>;
  getOrderBook(marketId: string, depth?: number, signal?: AbortSignal): Promise<NormalizedOrderBook | null>;
  getFills(marketId: string, options?: HistoryOptions): Promise<readonly NormalizedFill[]>;
  getCandles(
    marketId: string,
    intervalSeconds: number,
    options?: ReadOptions,
  ): Promise<readonly NormalizedCandle[]>;
  getResolution(marketId: string, signal?: AbortSignal): Promise<ResolutionSnapshot | null>;
  getPositions(account: string, signal?: AbortSignal): Promise<readonly NormalizedPosition[]>;
  getClaims(account: string, signal?: AbortSignal): Promise<readonly NormalizedClaim[]>;
  getOutcomeBalances(
    account: string,
    marketId: string,
    signal?: AbortSignal,
  ): Promise<OutcomeBalances | null>;
}

export interface ReadOptions {
  limit?: number;
  signal?: AbortSignal;
}

export interface HistoryOptions extends ReadOptions {
  offset?: number;
}

export type DreamDexAdapterErrorKind =
  "aborted" | "invalid_input" | "invalid_upstream" | "indexer" | "rpc" | "contract" | "unknown";

export class DreamDexAdapterError extends Error {
  constructor(
    readonly kind: DreamDexAdapterErrorKind,
    readonly operation: string,
    message: string,
    readonly causeError?: unknown,
  ) {
    super(message, causeError === undefined ? undefined : { cause: causeError });
    this.name = "DreamDexAdapterError";
  }
}

export interface DreamDexAdapterOptions {
  network?: SomniaNetwork;
  registry?: DreamDexContractRegistry;
  sdk?: DreamDexSdkReadClient;
  chainReader?: DreamDexChainReader;
  signal?: AbortSignal;
  staleAfterMs?: number;
  clock?: () => Date;
}

export class ProductionDreamDexAdapter implements DreamDexReadAdapter {
  readonly #network: SomniaNetwork;
  readonly #sdk: DreamDexSdkReadClient;
  readonly #chain: DreamDexChainReader;
  readonly #signal: AbortSignal | undefined;
  readonly #staleAfterMs: number;
  readonly #clock: () => Date;

  constructor(options: DreamDexAdapterOptions = {}) {
    const registry = options.registry ?? getDreamDexRegistry(options.network ?? "shannon");
    this.#network = registry.network;
    this.#signal = options.signal;
    this.#staleAfterMs = options.staleAfterMs ?? 10_000;
    this.#clock = options.clock ?? (() => new Date());
    if (options.sdk) this.#sdk = options.sdk;
    else {
      const exchange = new SomniaMarkets({
        indexerUrl: registry.indexerUrl,
        chain: registry.chain,
        wsRpcUrl: registry.wsUrls[0],
        addresses: registry.addresses,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      this.#sdk = exchange.client;
    }
    this.#chain = options.chainReader ?? createResilientRpcRouter(registry);
  }

  async listLiveMarkets(signal?: AbortSignal): Promise<readonly NormalizedMarket[]> {
    return this.#execute("listLiveMarkets", signal, async () =>
      this.#normalizeMarkets(await this.#sdk.listLiveBinaryMarkets()),
    );
  }

  async listHistoricalMarkets(options: HistoryOptions = {}): Promise<readonly NormalizedMarket[]> {
    return this.#execute("listHistoricalMarkets", options.signal, async () => {
      const markets = await this.#sdk.listPastBinaryMarkets({
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.offset === undefined ? {} : { offset: options.offset }),
      });
      return this.#normalizeMarkets(markets);
    });
  }

  async getMarket(marketId: string, signal?: AbortSignal): Promise<NormalizedMarket | null> {
    return this.#execute("getMarket", signal, async () => {
      const market = await this.#sdk.getBinaryMarket(marketId);
      if (!market) return null;
      const [binding, opening, closing] = await Promise.all([
        this.#resolveBinding(market.marketId),
        this.#sdk.getOpeningPrices([market.marketId]),
        this.#sdk.getResolutionPrices([market.marketId]),
      ]);
      const key = market.marketId.toLowerCase();
      return this.#normalizeMarket(market, binding, opening[key] ?? null, closing[key] ?? null);
    });
  }

  async getOrderBook(
    marketId: string,
    depth = 25,
    signal?: AbortSignal,
  ): Promise<NormalizedOrderBook | null> {
    return this.#execute("getOrderBook", signal, async () => {
      const context = await this.#marketContext(marketId);
      if (!context) return null;
      const book = await this.#sdk.getBinaryOrderBook(context.binding.poolAddress, {
        depth,
        decimals: context.binding.collateralDecimals,
      });
      return normalizeBook(
        this.#network,
        context.market.marketId,
        context.binding,
        book,
        this.#freshness(context.binding.sourceBlock),
      );
    });
  }

  async getFills(marketId: string, options: HistoryOptions = {}): Promise<readonly NormalizedFill[]> {
    return this.#execute("getFills", options.signal, async () => {
      const context = await this.#marketContext(marketId);
      if (!context) return [];
      const rows = await this.#sdk.getFills(context.binding.poolAddress, {
        since: safeUnixNumber(context.market.tradingStart),
        until: safeUnixNumber(context.market.expiry),
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.offset === undefined ? {} : { offset: options.offset }),
      });
      const wanted = context.market.marketId.toLowerCase();
      return rows
        .filter((row) => row.market.toLowerCase() === wanted)
        .filter((row) => inMarketWindow(row.timestamp, context.market))
        .map((row) => normalizeFill(this.#network, context.market, context.binding, row));
    });
  }

  async getCandles(
    marketId: string,
    intervalSeconds: number,
    options: ReadOptions = {},
  ): Promise<readonly NormalizedCandle[]> {
    return this.#execute("getCandles", options.signal, async () => {
      const context = await this.#marketContext(marketId);
      if (!context) return [];
      const rows = await this.#sdk.getCandles(context.binding.poolAddress, intervalSeconds, {
        from: safeUnixNumber(context.market.tradingStart),
        to: safeUnixNumber(context.market.expiry),
        ...(options.limit === undefined ? {} : { limit: options.limit }),
      });
      return rows
        .filter((row) => inMarketWindow(row.bucketStart, context.market))
        .map((row) =>
          normalizeCandle(context.market.marketId, context.binding.poolAddress, intervalSeconds, row),
        );
    });
  }

  async getResolution(marketId: string, signal?: AbortSignal): Promise<ResolutionSnapshot | null> {
    return this.#execute("getResolution", signal, async () => {
      const context = await this.#marketContext(marketId);
      if (!context) return null;
      const id = context.market.marketId;
      const [indexed, openings, closings, onchain] = await Promise.all([
        this.#sdk.getMarketResolution(id),
        this.#sdk.getOpeningPrices([id]),
        this.#sdk.getResolutionPrices([id]),
        this.#sdk.getOnchainResolutionPrice(id),
      ]);
      const key = id.toLowerCase();
      return normalizeResolutionSnapshot(
        context.market,
        context.binding,
        indexed,
        openings[key] ?? null,
        closings[key] ?? onchain?.numericValue ?? null,
        this.#freshness(context.binding.sourceBlock),
      );
    });
  }

  async getPositions(account: string, signal?: AbortSignal): Promise<readonly NormalizedPosition[]> {
    return this.#execute("getPositions", signal, async () => {
      const [rows, sourceBlock] = await Promise.all([
        this.#sdk.getOpenPositionsWithPnL(account),
        this.#chain.getBlockNumber(),
      ]);
      const freshness = this.#freshness(sourceBlock);
      return rows.flatMap((row) => normalizePositionRows(account, row, freshness));
    });
  }

  async getClaims(account: string, signal?: AbortSignal): Promise<readonly NormalizedClaim[]> {
    return this.#execute("getClaims", signal, async () => {
      const [rows, sourceBlock] = await Promise.all([
        this.#sdk.getClaimable(account),
        this.#chain.getBlockNumber(),
      ]);
      const freshness = this.#freshness(sourceBlock);
      return rows.map((row) => normalizeClaim(account, row, freshness));
    });
  }

  async getOutcomeBalances(
    account: string,
    marketId: string,
    signal?: AbortSignal,
  ): Promise<OutcomeBalances | null> {
    return this.#execute("getOutcomeBalances", signal, async () => {
      const context = await this.#marketContext(marketId);
      if (!context) return null;
      const balances = await this.#sdk.getOutcomeBalances(account, context.binding.marketAddress);
      return OutcomeBalancesSchema.parse({
        account,
        marketId: context.market.marketId,
        marketAddress: context.binding.marketAddress,
        up: balances.yes,
        down: balances.no,
        freshness: this.#freshness(context.binding.sourceBlock),
      });
    });
  }

  async #normalizeMarkets(markets: readonly BinaryMarket[]): Promise<readonly NormalizedMarket[]> {
    if (markets.length === 0) return [];
    const ids = markets.map((market) => market.marketId);
    const [bindings, opening, closing] = await Promise.all([
      Promise.all(ids.map((id) => this.#resolveBinding(id))),
      this.#sdk.getOpeningPrices(ids),
      this.#sdk.getResolutionPrices(ids),
    ]);
    return markets.map((market, index) => {
      const binding = bindings[index];
      if (!binding)
        throw new DreamDexAdapterError("invalid_upstream", "listMarkets", "Missing market binding");
      const key = market.marketId.toLowerCase();
      return this.#normalizeMarket(market, binding, opening[key] ?? null, closing[key] ?? null);
    });
  }

  #normalizeMarket(
    market: BinaryMarket,
    binding: ResolvedMarketBinding,
    openingPrice: string | null,
    resolutionPrice: string | null,
  ): NormalizedMarket {
    const interval = market.intervalSec ?? (BigInt(market.expiry) - BigInt(market.tradingStart)).toString();
    return NormalizedMarketSchema.parse({
      network: this.#network,
      venue: "dreamdex",
      marketId: market.marketId,
      marketAddress: binding.marketAddress,
      poolAddress: binding.poolAddress,
      poolNonce: binding.poolNonce.toString(),
      collateralAddress: binding.collateralAddress,
      collateralDecimals: binding.collateralDecimals,
      outcomeTokenAddress: binding.outcomeTokenAddress,
      upTokenId: binding.upTokenId.toString(),
      downTokenId: binding.downTokenId.toString(),
      question: market.question,
      asset: market.asset,
      oracle: market.oracleQuestion ?? market.question,
      status: statusFromOnchain(binding),
      tradingStart: isoFromUnix(market.tradingStart),
      expiresAt: isoFromUnix(market.expiry),
      cadence: { intervalSeconds: interval, seriesKey: `${this.#network}:${market.asset}:${interval}` },
      lastPrice: market.lastPrice,
      cumulativeQuoteVolume: market.cumulativeQuoteVolume,
      backing: binding.backing.toString(),
      finalized: binding.finalized,
      resolution: marketResolution(market, binding, openingPrice, resolutionPrice),
      freshness: this.#freshness(binding.sourceBlock),
    });
  }

  async #marketContext(
    marketId: string,
  ): Promise<{ market: BinaryMarket; binding: ResolvedMarketBinding } | null> {
    const market = await this.#sdk.getBinaryMarket(marketId);
    if (!market) return null;
    return { market, binding: await this.#resolveBinding(market.marketId) };
  }

  #resolveBinding(marketId: Hex): Promise<ResolvedMarketBinding> {
    return resolveMarketBinding(marketId, {
      getMarketOnchain: (id) => this.#sdk.getMarketOnchain(id),
      getBlockNumber: () => this.#chain.getBlockNumber(),
    });
  }

  #freshness(sourceBlock: bigint): DataFreshness {
    const observedAt = this.#clock();
    return DataFreshnessSchema.parse({
      sourceBlock: sourceBlock.toString(),
      observedAt: observedAt.toISOString(),
      staleAt: new Date(observedAt.getTime() + this.#staleAfterMs).toISOString(),
      authoritative: true,
      state: "fresh",
    });
  }

  async #execute<T>(
    operation: string,
    signal: AbortSignal | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    const effectiveSignal = signal ?? this.#signal;
    try {
      effectiveSignal?.throwIfAborted();
      const value = await action();
      effectiveSignal?.throwIfAborted();
      return value;
    } catch (error) {
      if (error instanceof DreamDexAdapterError) throw error;
      throw mapAdapterError(operation, error);
    }
  }
}

export function createDreamDexAdapter(options: DreamDexAdapterOptions = {}): ProductionDreamDexAdapter {
  return new ProductionDreamDexAdapter(options);
}

export function createShannonDreamDexAdapter(signal?: AbortSignal): ProductionDreamDexAdapter {
  return new ProductionDreamDexAdapter({ network: "shannon", ...(signal ? { signal } : {}) });
}

function normalizeBook(
  network: SomniaNetwork,
  marketId: Hex,
  binding: ResolvedMarketBinding,
  book: BinaryOrderBook,
  freshness: DataFreshness,
): NormalizedOrderBook {
  const levels = (rows: BinaryOrderBook["yesBids"]) =>
    rows.map((row) => ({ price: row.price.toString(), quantity: row.quantity.toString() }));
  return NormalizedOrderBookSchema.parse({
    network,
    venue: "dreamdex",
    marketId,
    poolAddress: binding.poolAddress,
    collateralDecimals: binding.collateralDecimals,
    upBids: levels(book.yesBids),
    upAsks: levels(book.yesAsks),
    downBids: levels(book.noBids),
    downAsks: levels(book.noAsks),
    freshness,
  });
}

function normalizeFill(
  network: SomniaNetwork,
  market: BinaryMarket,
  binding: ResolvedMarketBinding,
  row: FillRow,
): NormalizedFill {
  const [blockNumber, logIndex, extra] = row.id.split("_");
  if (
    !blockNumber ||
    !logIndex ||
    extra !== undefined ||
    !/^\d+$/.test(blockNumber) ||
    !/^\d+$/.test(logIndex)
  ) {
    throw new DreamDexAdapterError("invalid_upstream", "getFills", `DreamDEX fill has invalid id: ${row.id}`);
  }
  const side = row.takerOrder?.side ?? row.takerSide ?? row.makerSide;
  if (!side) {
    throw new DreamDexAdapterError(
      "invalid_upstream",
      "getFills",
      `DreamDEX fill ${row.id} has no binary side`,
    );
  }
  const outcome = side.endsWith("NO") ? "down" : "up";
  const rawPrice = BigInt(row.fillPrice);
  const price = outcome === "down" ? 10n ** BigInt(binding.collateralDecimals) - rawPrice : rawPrice;
  return NormalizedFillSchema.parse({
    network,
    venue: "dreamdex",
    marketId: market.marketId,
    poolAddress: binding.poolAddress,
    transactionHash: row.txHash,
    logIndex,
    blockNumber,
    timestamp: isoFromUnix(row.timestamp),
    outcome,
    side: side.startsWith("BUY") ? "buy" : "sell",
    price: price.toString(),
    quantity: row.quantity,
    quoteQuantity: row.quoteQuantity,
    maker: row.maker,
    taker: row.takerOrder?.owner ?? row.taker,
  });
}

function normalizeCandle(
  marketId: Hex,
  poolAddress: Address,
  intervalSeconds: number,
  row: Candle,
): NormalizedCandle {
  return NormalizedCandleSchema.parse({
    marketId,
    poolAddress,
    intervalSeconds: intervalSeconds.toString(),
    timestamp: isoFromUnix(row.bucketStart),
    open: row.openPrice,
    high: row.high,
    low: row.low,
    close: row.closePrice,
    baseVolume: row.baseVolume,
    quoteVolume: row.quoteVolume,
    tradeCount: row.tradeCount.toString(),
  });
}

function normalizeResolutionSnapshot(
  market: BinaryMarket,
  binding: ResolvedMarketBinding,
  indexed: MarketResolutionRead,
  openingPrice: string | null,
  resolutionPrice: string | null,
  freshness: DataFreshness,
): ResolutionSnapshot {
  return ResolutionSnapshotSchema.parse({
    marketId: market.marketId,
    resolution: marketResolution(market, binding, openingPrice, resolutionPrice),
    eventCount: indexed.events.length.toString(),
    freshness,
  });
}

function normalizePositionRows(
  account: string,
  row: OpenPositionPnL,
  freshness: DataFreshness,
): NormalizedPosition[] {
  const legs = [
    { outcome: "up" as const, value: row.outcomes.yes },
    { outcome: "down" as const, value: row.outcomes.no },
  ];
  return legs
    .filter((leg) => leg.value.balance > 0n)
    .map((leg) =>
      NormalizedPositionSchema.parse({
        account,
        marketId: row.market.id,
        poolAddress: row.market.poolAddress,
        outcome: leg.outcome,
        balance: leg.value.balance.toString(),
        averageEntryPrice: leg.value.avgCost.toString(),
        realizedPnl: leg.value.realizedPnl.toString(),
        unrealizedPnl: leg.value.unrealizedPnl?.toString() ?? "0",
        freshness,
      }),
    );
}

function normalizeClaim(account: string, row: ClaimablePosition, freshness: DataFreshness): NormalizedClaim {
  return NormalizedClaimSchema.parse({
    account,
    marketId: row.marketId,
    poolAddress: row.pool,
    outcome: row.outcomeIdx === 0 ? "up" : "down",
    amount: row.amount.toString(),
    estimatedPayout: row.estPayout.toString(),
    status: "claimable",
    freshness,
  });
}

function marketResolution(
  market: BinaryMarket,
  binding: ResolvedMarketBinding,
  openingPrice: string | null,
  resolutionPrice: string | null,
) {
  const payout = market.payoutNumerators ?? null;
  return {
    state: binding.isVoided ? "voided" : binding.isResolved ? "resolved" : "unresolved",
    winningOutcome: binding.isResolved ? (binding.winningOutcome === 0 ? "up" : "down") : null,
    openingPrice,
    resolutionPrice,
    payoutUp: payout?.[0] ?? null,
    payoutDown: payout?.[1] ?? null,
    payoutDenominator: market.payoutDenominator ?? null,
  } as const;
}

function statusFromOnchain(binding: ResolvedMarketBinding): NormalizedMarket["status"] {
  const statuses = ["listed", "trading", "locked", "settling", "resolved", "voided"] as const;
  const status = statuses[binding.status];
  if (!status) {
    throw new DreamDexAdapterError(
      "invalid_upstream",
      "normalizeMarket",
      `Unknown on-chain market status: ${binding.status}`,
    );
  }
  return status;
}

function safeUnixNumber(value: string): number {
  if (!/^\d+$/.test(value))
    throw new DreamDexAdapterError("invalid_upstream", "timestamp", `Invalid timestamp: ${value}`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new DreamDexAdapterError("invalid_upstream", "timestamp", `Timestamp exceeds safe range: ${value}`);
  }
  return result;
}

function isoFromUnix(value: string): string {
  const date = new Date(safeUnixNumber(value) * 1_000);
  if (Number.isNaN(date.getTime()))
    throw new DreamDexAdapterError("invalid_upstream", "timestamp", `Invalid timestamp: ${value}`);
  return date.toISOString();
}

function inMarketWindow(value: string, market: BinaryMarket): boolean {
  return BigInt(value) >= BigInt(market.tradingStart) && BigInt(value) <= BigInt(market.expiry);
}

function mapAdapterError(operation: string, error: unknown): DreamDexAdapterError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new DreamDexAdapterError("aborted", operation, `DreamDEX ${operation} was aborted`, error);
  }
  if (error instanceof IndexerError) {
    return new DreamDexAdapterError(
      "indexer",
      operation,
      `DreamDEX indexer failed during ${operation}`,
      error,
    );
  }
  if (error instanceof RpcError) {
    return new DreamDexAdapterError("rpc", operation, `Somnia RPC failed during ${operation}`, error);
  }
  if (error instanceof ContractRevertError) {
    return new DreamDexAdapterError(
      "contract",
      operation,
      `DreamDEX contract read reverted during ${operation}`,
      error,
    );
  }
  if (error instanceof InvalidInputError) {
    return new DreamDexAdapterError("invalid_input", operation, error.message, error);
  }
  if (error instanceof Error && error.name === "ZodError") {
    return new DreamDexAdapterError(
      "invalid_upstream",
      operation,
      `DreamDEX returned invalid ${operation} data`,
      error,
    );
  }
  return new DreamDexAdapterError("unknown", operation, `DreamDEX ${operation} failed`, error);
}
