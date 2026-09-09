import type { DreamDexMarketGenerationRepository } from "@eventrail/database";
import type { DreamDexReadAdapter } from "@eventrail/dreamdex-adapter";
import { DataStreamEventSchema, type DataStreamEvent, type NormalizedMarket } from "@eventrail/types";

export const workerName = "market-sync";

export interface MarketSyncRun {
  startedAt: string;
  discovered: number;
  updated: number;
  ignoredStale: number;
  rollovers: number;
  terminalTransitions: number;
  checkpoint: string;
}

export interface MarketSyncEventPublisher {
  publish(event: DataStreamEvent): Promise<void>;
}

export interface MarketSynchronizerOptions {
  historicalLimit?: number;
  clock?: () => Date;
}

export class MarketStateTransitionError extends Error {
  constructor(
    readonly marketId: string,
    readonly from: NormalizedMarket["status"],
    readonly to: NormalizedMarket["status"],
  ) {
    super(`Invalid market transition for ${marketId}: ${from} -> ${to}`);
    this.name = "MarketStateTransitionError";
  }
}

export class MarketSynchronizer {
  readonly #historicalLimit: number;
  readonly #clock: () => Date;

  constructor(
    private readonly adapter: DreamDexReadAdapter,
    private readonly repository: DreamDexMarketGenerationRepository,
    private readonly publisher: MarketSyncEventPublisher,
    options: MarketSynchronizerOptions = {},
  ) {
    this.#historicalLimit = options.historicalLimit ?? 250;
    this.#clock = options.clock ?? (() => new Date());
  }

  async synchronize(signal?: AbortSignal): Promise<MarketSyncRun> {
    const startedAt = this.#clock();
    const [live, historical] = await Promise.all([
      this.adapter.listLiveMarkets(signal),
      this.adapter.listHistoricalMarkets({
        limit: this.#historicalLimit,
        ...(signal ? { signal } : {}),
      }),
    ]);
    const discovered = deduplicate([...historical, ...live]);
    let updated = 0;
    let ignoredStale = 0;
    let terminalTransitions = 0;
    let highestBlock = 0n;

    for (const market of discovered) {
      assertAuthoritative(market, startedAt);
      const sourceBlock = BigInt(market.freshness.sourceBlock);
      if (sourceBlock > highestBlock) highestBlock = sourceBlock;
      const previous = await this.repository.findGeneration(market.network, market.marketId);
      if (previous && BigInt(previous.freshness.sourceBlock) > sourceBlock) {
        ignoredStale += 1;
        continue;
      }
      if (previous) assertTransition(previous, market);
      await this.repository.upsertGeneration(market);
      updated += 1;
      if (previous && !isTerminal(previous.status) && isTerminal(market.status)) {
        await this.publisher.publish(terminalEvent(market));
        terminalTransitions += 1;
      }
    }

    let rollovers = 0;
    const series = groupBySeries(discovered);
    for (const markets of series.values()) {
      const current = newestGeneration(markets);
      const previous = await this.repository.findSeriesHead(current.network, current.cadence.seriesKey);
      if (!previous || BigInt(previous.freshness.sourceBlock) <= BigInt(current.freshness.sourceBlock)) {
        await this.repository.setSeriesHead(current);
      }
      if (previous && previous.marketId.toLowerCase() !== current.marketId.toLowerCase()) {
        await this.publisher.publish(rolloverEvent(previous, current));
        rollovers += 1;
      }
    }

    return {
      startedAt: startedAt.toISOString(),
      discovered: discovered.length,
      updated,
      ignoredStale,
      rollovers,
      terminalTransitions,
      checkpoint: highestBlock.toString(),
    };
  }
}

function deduplicate(markets: readonly NormalizedMarket[]): NormalizedMarket[] {
  const byId = new Map<string, NormalizedMarket>();
  for (const market of markets) {
    const key = `${market.network}:${market.marketId.toLowerCase()}`;
    const previous = byId.get(key);
    if (!previous || BigInt(previous.freshness.sourceBlock) <= BigInt(market.freshness.sourceBlock)) {
      byId.set(key, market);
    }
  }
  return [...byId.values()];
}

function groupBySeries(markets: readonly NormalizedMarket[]): Map<string, NormalizedMarket[]> {
  const grouped = new Map<string, NormalizedMarket[]>();
  for (const market of markets) {
    const key = `${market.network}:${market.cadence.seriesKey}`;
    const values = grouped.get(key) ?? [];
    values.push(market);
    grouped.set(key, values);
  }
  return grouped;
}

function newestGeneration(markets: readonly NormalizedMarket[]): NormalizedMarket {
  const sorted = [...markets].sort((left, right) => {
    const byStart = Date.parse(right.tradingStart) - Date.parse(left.tradingStart);
    return byStart || right.marketId.localeCompare(left.marketId);
  });
  const market = sorted[0];
  if (!market) throw new Error("Cannot choose a market from an empty series");
  return market;
}

function assertAuthoritative(market: NormalizedMarket, now: Date): void {
  if (
    !market.freshness.authoritative ||
    market.freshness.state !== "fresh" ||
    Date.parse(market.freshness.staleAt) <= now.getTime()
  ) {
    throw new Error(`Market ${market.marketId} is not fresh authoritative state`);
  }
}

function assertTransition(previous: NormalizedMarket, next: NormalizedMarket): void {
  if (previous.status === next.status) return;
  if (isTerminal(previous.status)) {
    throw new MarketStateTransitionError(next.marketId, previous.status, next.status);
  }
  const rank: Record<NormalizedMarket["status"], number> = {
    listed: 0,
    trading: 1,
    locked: 2,
    settling: 3,
    resolved: 4,
    voided: 4,
  };
  if (rank[next.status] < rank[previous.status]) {
    throw new MarketStateTransitionError(next.marketId, previous.status, next.status);
  }
}

function isTerminal(status: NormalizedMarket["status"]): boolean {
  return status === "resolved" || status === "voided";
}

function rolloverEvent(previous: NormalizedMarket, current: NormalizedMarket): DataStreamEvent {
  return DataStreamEventSchema.parse({
    version: "1",
    type: "market.rolled-over",
    eventId: `rollover:${current.cadence.seriesKey}:${previous.marketId}:${current.marketId}`,
    sequence: current.freshness.sourceBlock,
    network: current.network,
    venue: "dreamdex",
    marketId: current.marketId,
    sourceBlock: current.freshness.sourceBlock,
    logIndex: null,
    observedAt: current.freshness.observedAt,
    payload: {
      seriesKey: current.cadence.seriesKey,
      previousMarketId: previous.marketId,
      currentMarketId: current.marketId,
    },
  });
}

function terminalEvent(market: NormalizedMarket): DataStreamEvent {
  return DataStreamEventSchema.parse({
    version: "1",
    type: "market.settled",
    eventId: `settlement:${market.marketId}:${market.freshness.sourceBlock}`,
    sequence: market.freshness.sourceBlock,
    network: market.network,
    venue: "dreamdex",
    marketId: market.marketId,
    sourceBlock: market.freshness.sourceBlock,
    logIndex: null,
    observedAt: market.freshness.observedAt,
    payload: { status: market.status, resolution: market.resolution },
  });
}
