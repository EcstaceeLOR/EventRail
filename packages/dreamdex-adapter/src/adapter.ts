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
  type SpotMarket,
  type SpotOrderBook,
  erc20WriteAbi,
  binaryPoolWriteAbi,
  spotPoolWriteAbi,
} from "@somnia-chain/markets-sdk";
import { calculatePositionValuation } from "@eventrail/core";
import { createPublicClient, encodeFunctionData, http, type Address, type Hex } from "viem";
import {
  DataFreshnessSchema,
  BookParametersSchema,
  NormalizedCandleSchema,
  NormalizedClaimSchema,
  NormalizedFillSchema,
  NormalizedMarketSchema,
  NormalizedOrderBookSchema,
  NormalizedPositionSchema,
  OutcomeBalancesSchema,
  ResolutionSnapshotSchema,
  type DataFreshness,
  type BookParameters,
  type NormalizedCandle,
  type NormalizedClaim,
  type NormalizedFill,
  type NormalizedMarket,
  type NormalizedOrderBook,
  type NormalizedPosition,
  type OutcomeBalances,
  type ResolutionSnapshot,
  type SomniaNetwork,
  FundingRouteSchema,
  type FundingRoute,
  PortfolioPositionSchema,
  type PortfolioPosition,
  PortfolioSnapshotSchema,
  type PortfolioSnapshot,
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
  | "getBinaryBookParams"
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
  | "getOutcomeBalance"
  | "getRouterActions"
>;

export type DreamDexSpotReadClient = Pick<SomniaMarketsClient, "listSpotMarkets" | "getSpotOrderBook">;

export interface DreamDexChainReader {
  getBlockNumber(): Promise<bigint>;
}

export interface DreamDexReadAdapter {
  listLiveMarkets(signal?: AbortSignal): Promise<readonly NormalizedMarket[]>;
  listHistoricalMarkets(options?: HistoryOptions): Promise<readonly NormalizedMarket[]>;
  getMarket(marketId: string, signal?: AbortSignal): Promise<NormalizedMarket | null>;
  getOrderBook(marketId: string, depth?: number, signal?: AbortSignal): Promise<NormalizedOrderBook | null>;
  getBookParameters(marketId: string, signal?: AbortSignal): Promise<BookParameters | null>;
  getFills(marketId: string, options?: HistoryOptions): Promise<readonly NormalizedFill[]>;
  getCandles(
    marketId: string,
    intervalSeconds: number,
    options?: ReadOptions,
  ): Promise<readonly NormalizedCandle[]>;
  getResolution(marketId: string, signal?: AbortSignal): Promise<ResolutionSnapshot | null>;
  getPositions(account: string, signal?: AbortSignal): Promise<readonly NormalizedPosition[]>;
  getPortfolioSnapshot(account: string, signal?: AbortSignal): Promise<PortfolioSnapshot>;
  getClaims(account: string, signal?: AbortSignal): Promise<readonly NormalizedClaim[]>;
  getOutcomeBalances(
    account: string,
    marketId: string,
    signal?: AbortSignal,
  ): Promise<OutcomeBalances | null>;
  getUsdsoFundingRoute(
    input: {
      account: Address;
      targetOutputQuantity: string;
      maxSlippageBps: number;
    },
    signal?: AbortSignal,
  ): Promise<FundingRoute | null>;
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
  spotSdk?: DreamDexSpotReadClient;
  chainReader?: DreamDexChainReader;
  signal?: AbortSignal;
  staleAfterMs?: number;
  clock?: () => Date;
}

export class ProductionDreamDexAdapter implements DreamDexReadAdapter {
  readonly #network: SomniaNetwork;
  readonly #sdk: DreamDexSdkReadClient;
  readonly #spotSdk: DreamDexSpotReadClient | null;
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
    if (options.sdk) {
      this.#sdk = options.sdk;
      this.#spotSdk = options.spotSdk ?? null;
    } else {
      const exchange = new SomniaMarkets({
        indexerUrl: registry.indexerUrl,
        chain: registry.chain,
        wsRpcUrl: registry.wsUrls[0],
        addresses: registry.addresses,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      this.#sdk = exchange.client;
      this.#spotSdk = exchange.client;
    }
    this.#chain = options.chainReader ?? createResilientRpcRouter(registry);
  }

  async getUsdsoFundingRoute(
    input: { account: Address; targetOutputQuantity: string; maxSlippageBps: number },
    signal?: AbortSignal,
  ): Promise<FundingRoute | null> {
    return this.#execute("getUsdsoFundingRoute", signal, async () => {
      if (!this.#spotSdk) return null;
      const markets = await this.#spotSdk.listSpotMarkets({ quoteSymbol: "USDso", limit: 50 });
      const market =
        markets.find((candidate) => candidate.baseIsNative) ??
        markets.find((candidate) => candidate.baseSymbol?.toUpperCase() === "SOMI");
      if (!market) return null;
      const book = await this.#spotSdk.getSpotOrderBook(market.poolAddress, { depth: 100 });
      return buildUsdsoFundingRoute(
        this.#network,
        market,
        book,
        input,
        await this.#chain.getBlockNumber(),
        this.#clock(),
      );
    });
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

  async getBookParameters(marketId: string, signal?: AbortSignal): Promise<BookParameters | null> {
    return this.#execute("getBookParameters", signal, async () => {
      const market = await this.#sdk.getBinaryMarket(marketId);
      if (!market) return null;
      const [binding, parameters] = await Promise.all([
        this.#resolveBinding(market.marketId),
        this.#sdk.getBinaryBookParams(market.poolAddress),
      ]);
      const freshness = await this.#freshness(binding.sourceBlock);
      return BookParametersSchema.parse({
        marketId: binding.marketId,
        poolAddress: binding.poolAddress,
        tickSize: parameters.tickSize.toString(),
        lotSize: parameters.lotSize.toString(),
        minimumQuantity: parameters.minQuantity.toString(),
        freshness,
      });
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
        this.#network,
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

  async getPortfolioSnapshot(account: string, signal?: AbortSignal): Promise<PortfolioSnapshot> {
    return this.#execute("getPortfolioSnapshot", signal, async () => {
      const [rows, sourceBlock, routerActions] = await Promise.all([
        this.#sdk.getOpenPositionsWithPnL(account),
        this.#chain.getBlockNumber(),
        this.#sdk.getRouterActions(account, { kind: "Redeem", limit: 1000 }),
      ]);
      const freshness = this.#freshness(sourceBlock);
      const result: PortfolioPosition[] = [];
      const rowsByMarket = new Map(rows.map((row) => [row.market.id.toLowerCase(), row]));
      const redemptions = new Map<string, { amount: bigint; payout: bigint }>();
      for (const action of routerActions) {
        if (action.kind !== "Redeem" || !action.market) continue;
        const key = action.market.toLowerCase();
        const current = redemptions.get(key) ?? { amount: 0n, payout: 0n };
        current.amount += BigInt(action.amount);
        current.payout += BigInt(action.payout ?? "0");
        redemptions.set(key, current);
      }
      const marketIds = new Set([...rowsByMarket.keys(), ...redemptions.keys()]);
      for (const marketKey of marketIds) {
        const row = rowsByMarket.get(marketKey);
        const [context, indexed] = await Promise.all([
          this.#marketContext(marketKey),
          this.#sdk.getMarketResolution(marketKey),
        ]);
        if (!context) continue;
        const binding = context.binding;
        const indexedResolution = marketResolution(
          context.market,
          binding,
          indexed.openingAnswer?.numericValue ?? null,
          indexed.closingAnswer?.numericValue ?? null,
        );
        const evidence = oracleEvidence(this.#network, context.market, indexed);
        const emptyLeg = {
          balance: 0n,
          costBasis: 0n,
          avgCost: 0n,
          markPrice: null,
          realizedPnl: 0n,
        };
        const legs = [
          { outcome: "up" as const, id: binding.upTokenId, value: row?.outcomes.yes ?? emptyLeg },
          { outcome: "down" as const, id: binding.downTokenId, value: row?.outcomes.no ?? emptyLeg },
        ];
        const intervalSeconds =
          context.market.intervalSec ??
          (BigInt(context.market.expiry) - BigInt(context.market.tradingStart)).toString();
        for (const leg of legs) {
          const redeemed =
            indexedResolution.state === "resolved" && indexedResolution.winningOutcome === leg.outcome
              ? (redemptions.get(marketKey) ?? { amount: 0n, payout: 0n })
              : { amount: 0n, payout: 0n };
          const chainBalance = await this.#sdk.getOutcomeBalance({
            outcomeToken: binding.outcomeTokenAddress,
            account: account as Address,
            id: leg.id,
          });
          const valuation = calculatePositionValuation({
            balance: chainBalance,
            indexedBalance: leg.value.balance,
            indexedCostBasis: leg.value.costBasis,
            indexedAverageEntryPrice: leg.value.balance > 0n ? leg.value.avgCost : null,
            indexedMarkPrice: leg.value.markPrice,
            indexedRealizedPnl: leg.value.realizedPnl,
            resolution: indexedResolution,
            outcome: leg.outcome,
            collateralDecimals: context.market.quoteDecimals,
            redeemedQuantity: redeemed.amount,
            redemptionPayout: redeemed.payout,
          });
          if (chainBalance === 0n && leg.value.balance === 0n && redeemed.amount === 0n) continue;
          result.push(
            PortfolioPositionSchema.parse({
              account,
              network: this.#network,
              marketId: context.market.marketId,
              marketAddress: binding.marketAddress,
              poolAddress: binding.poolAddress,
              outcomeTokenAddress: binding.outcomeTokenAddress,
              tokenId: leg.id.toString(),
              outcome: leg.outcome,
              question: context.market.question,
              asset: context.market.asset,
              cadence: {
                intervalSeconds,
                seriesKey: `${this.#network}:${context.market.asset}:${intervalSeconds}`,
              },
              status: statusFromOnchain(binding),
              expiresAt: isoFromUnix(context.market.expiry),
              collateralDecimals: context.market.quoteDecimals,
              balance: chainBalance.toString(),
              indexedBalance: leg.value.balance.toString(),
              costBasis: valuation.costBasis.toString(),
              averageEntryPrice: valuation.averageEntryPrice?.toString() ?? null,
              markPrice: valuation.markPrice?.toString() ?? null,
              markValue: valuation.markValue?.toString() ?? null,
              realizedPnl: valuation.realizedPnl.toString(),
              unrealizedPnl: valuation.unrealizedPnl?.toString() ?? null,
              settlementPayout: valuation.settlementPayout.toString(),
              redeemedQuantity: redeemed.amount.toString(),
              redemptionPayout: redeemed.payout.toString(),
              claimStatus: valuation.claimStatus,
              valuationAssumptions: valuation.assumptions,
              resolution: indexedResolution,
              oracleEvidence: evidence,
              freshness,
            }),
          );
        }
      }
      return PortfolioSnapshotSchema.parse({
        account,
        positions: result.sort((left, right) =>
          `${right.expiresAt}:${right.marketId}:${right.outcome}`.localeCompare(
            `${left.expiresAt}:${left.marketId}:${left.outcome}`,
          ),
        ),
        freshness,
      });
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

export function createBuilderCapabilityReader(network: SomniaNetwork = "shannon") {
  const registry = getDreamDexRegistry(network);
  const client = createPublicClient({ chain: registry.chain, transport: http(registry.rpcUrls[0]) });
  return async (input: { account: Address; pool: Address; builder: Address }) => {
    try {
      const [poolCapBpsTimes1k, userApprovalBpsTimes1k] = await Promise.all([
        client.readContract({
          address: input.pool,
          abi: binaryPoolWriteAbi,
          functionName: "getMaxBuilderFeeBpsTimes1k",
        }),
        client.readContract({
          address: input.pool,
          abi: binaryPoolWriteAbi,
          functionName: "getBuilderApproval",
          args: [input.account, input.builder],
        }),
      ]);
      return { poolCapBpsTimes1k, userApprovalBpsTimes1k };
    } catch {
      // Attribution is optional. Unknown or legacy pools always fall back to an
      // untagged order so this rail can never make an otherwise valid order revert.
      return null;
    }
  };
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
  network: SomniaNetwork,
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
    evidence: oracleEvidence(network, market, indexed),
    freshness,
  });
}

function oracleEvidence(network: SomniaNetwork, market: BinaryMarket, indexed: MarketResolutionRead) {
  const resolutionEvent = indexed.events.at(-1) ?? null;
  const evidenceTransaction =
    resolutionEvent?.txHash ?? indexed.closingAnswer?.txHash ?? indexed.openingAnswer?.txHash ?? null;
  return {
    marketId: market.marketId,
    question: market.oracleQuestion,
    closingQuestionId: indexed.closingAnswer?.oracleQuestionId ?? market.oracleQuestionId ?? null,
    openingQuestionId: indexed.reference?.oracleQuestionId ?? null,
    openingValue: indexed.openingAnswer?.numericValue ?? null,
    closingValue: indexed.closingAnswer?.numericValue ?? null,
    resolutionTransactionHash: resolutionEvent?.txHash ?? null,
    closingOracleTransactionHash: indexed.closingAnswer?.txHash ?? null,
    openingOracleTransactionHash: indexed.openingAnswer?.txHash ?? null,
    graphUrl: null,
    explorerUrl: evidenceTransaction
      ? `${network === "shannon" ? "https://shannon-explorer.somnia.network" : "https://explorer.somnia.network"}/tx/${evidenceTransaction}`
      : null,
    state:
      indexed.closingAnswer || indexed.openingAnswer || resolutionEvent
        ? ("available" as const)
        : market.status === "Resolved" || market.status === "Voided" || market.status === "Finalized"
          ? ("unavailable" as const)
          : ("pending" as const),
  };
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

export function buildUsdsoFundingRoute(
  network: SomniaNetwork,
  market: SpotMarket,
  book: SpotOrderBook,
  input: { account: Address; targetOutputQuantity: string; maxSlippageBps: number },
  sourceBlock: bigint,
  now: Date,
): FundingRoute | null {
  const target = BigInt(input.targetOutputQuantity);
  if (target <= 0n || input.maxSlippageBps < 0 || input.maxSlippageBps > 10_000) return null;
  const oneBase = 10n ** BigInt(market.baseDecimals);
  let received = 0n;
  let inputQuantity = 0n;
  let worstPrice = 0n;
  for (const level of book.bids) {
    if (level.price <= 0n || level.quantity <= 0n) continue;
    const remaining = target - received;
    if (remaining <= 0n) break;
    const needed = (remaining * oneBase + level.price - 1n) / level.price;
    const taken = needed < level.quantity ? needed : level.quantity;
    inputQuantity += taken;
    received += (taken * level.price) / oneBase;
    worstPrice = level.price;
  }
  if (received < target || worstPrice === 0n) return null;
  const lot = BigInt(market.lotSize);
  const snappedQuantity = ((inputQuantity + lot - 1n) / lot) * lot;
  if (snappedQuantity < BigInt(market.minQuantity)) return null;
  const tick = BigInt(market.tickSize);
  const slippagePrice = (worstPrice * BigInt(10_000 - input.maxSlippageBps)) / 10_000n;
  const limitPrice = (slippagePrice / tick) * tick;
  if (limitPrice <= 0n) return null;
  const expiresAt = new Date(now.getTime() + 30_000);
  const expiryNs = BigInt(expiresAt.getTime()) * 1_000_000n;
  const calls: FundingRoute["calls"] = [];
  if (!market.baseIsNative) {
    calls.push({
      kind: "approval",
      to: market.baseToken,
      data: encodeFunctionData({
        abi: erc20WriteAbi,
        functionName: "approve",
        args: [market.poolAddress, snappedQuantity],
      }),
      value: "0",
      gas: "150000",
      description: `Approve exactly ${snappedQuantity} ${market.baseSymbol ?? "base tokens"}`,
      requiresConfirmation: true,
    });
  }
  calls.push({
    kind: "funding",
    to: market.poolAddress,
    data: encodeFunctionData({
      abi: spotPoolWriteAbi,
      functionName: "placeOrder",
      args: [
        false,
        0n,
        limitPrice,
        snappedQuantity,
        expiryNs,
        2,
        0,
        "0x0000000000000000000000000000000000000000",
        0n,
      ],
    }),
    value: market.baseIsNative ? snappedQuantity.toString() : "0",
    gas: "750000",
    description: `Sell ${market.baseSymbol ?? "base asset"} for USDso through DreamDEX spot IOC liquidity`,
    requiresConfirmation: true,
  });
  return FundingRouteSchema.parse({
    version: "1",
    network,
    venue: "dreamdex-spot",
    account: input.account,
    poolAddress: market.poolAddress,
    inputToken: market.baseToken,
    outputToken: market.quoteToken,
    inputSymbol: market.baseSymbol ?? "SOMI",
    outputSymbol: "USDso",
    inputDecimals: market.baseDecimals,
    outputDecimals: market.quoteDecimals,
    inputQuantity: snappedQuantity.toString(),
    targetOutputQuantity: target.toString(),
    minimumOutputQuantity: ((target * BigInt(10_000 - input.maxSlippageBps)) / 10_000n).toString(),
    limitPrice: limitPrice.toString(),
    source: "DreamDEX spot order book",
    sourceBlock: sourceBlock.toString(),
    expiresAt: expiresAt.toISOString(),
    calls,
  });
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
