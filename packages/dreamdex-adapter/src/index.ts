import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import type { BinaryMarket, BinaryOrderBook, MarketOnchain } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, formatUnits, http } from "viem";
import type { EventMarket, TransactionPlan } from "@eventrail/types";

export const SOMNIA_SHANNON_CHAIN_ID = 50_312;
export const DREAMDEX_SHANNON_INDEXER_URL = "https://dev.smk.somnia.host/v1/graphql";
export const SOMNIA_SHANNON_RPC_URL = "https://dream-rpc.somnia.network";
export const SOMNIA_SHANNON_WS_URL = "wss://api.infra.testnet.somnia.network/ws";

export interface DreamDexReadAdapter {
  listMarkets(signal?: AbortSignal): Promise<readonly EventMarket[]>;
  getMarket(marketId: string, signal?: AbortSignal): Promise<EventMarket | null>;
}

export interface DreamDexTransactionAdapter {
  planTrade(input: {
    marketId: string;
    outcome: "yes" | "no";
    amountUsdso: string;
    account: `0x${string}`;
  }): Promise<TransactionPlan>;
}

export interface DreamDexMarketSnapshot {
  market: EventMarket;
  book: BinaryOrderBook;
  onchain: MarketOnchain;
}

export class ShannonDreamDexAdapter implements DreamDexReadAdapter {
  readonly #exchange: SomniaMarkets;
  readonly #rpc = createPublicClient({ chain: somniaShannon, transport: http(SOMNIA_SHANNON_RPC_URL) });

  constructor(signal?: AbortSignal) {
    this.#exchange = new SomniaMarkets({
      indexerUrl: DREAMDEX_SHANNON_INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: SOMNIA_SHANNON_WS_URL,
      addresses: SOMNIA_TESTNET_ADDRESSES,
      ...(signal ? { signal } : {}),
    });
  }

  async listMarkets(): Promise<readonly EventMarket[]> {
    const [markets, sourceBlock] = await Promise.all([
      this.#exchange.client.listLiveBinaryMarkets(),
      this.#rpc.getBlockNumber(),
    ]);
    const observedAt = new Date();
    return markets.map((market) => normalizeMarket(market, sourceBlock, observedAt));
  }

  async getMarket(marketId: string): Promise<EventMarket | null> {
    const [market, sourceBlock] = await Promise.all([
      this.#exchange.client.getBinaryMarket(marketId),
      this.#rpc.getBlockNumber(),
    ]);
    return market ? normalizeMarket(market, sourceBlock, new Date()) : null;
  }

  async getSnapshot(marketId: string): Promise<DreamDexMarketSnapshot | null> {
    const market = await this.#exchange.client.getBinaryMarket(marketId);
    if (!market) return null;
    const [book, onchain, sourceBlock] = await Promise.all([
      this.#exchange.client.getBinaryOrderBook(market.poolAddress, { depth: 10 }),
      this.#exchange.client.getMarketOnchain(market.marketId),
      this.#rpc.getBlockNumber(),
    ]);
    return { market: normalizeMarket(market, sourceBlock, new Date()), book, onchain };
  }
}

export function createShannonDreamDexAdapter(signal?: AbortSignal): ShannonDreamDexAdapter {
  return new ShannonDreamDexAdapter(signal);
}

function normalizeMarket(market: BinaryMarket, sourceBlock: bigint, observedAt: Date): EventMarket {
  const one = 10 ** market.quoteDecimals;
  const yesPrice = market.lastPrice === null ? 0.5 : Number(market.lastPrice) / one;
  const expiresAt = new Date(Number(market.expiry) * 1_000);
  const observedAtIso = observedAt.toISOString();

  return {
    id: market.id,
    slug: `${market.asset.toLowerCase()}-${market.id.slice(-8)}`,
    question: market.question,
    category: market.asset,
    phase: marketPhase(market, observedAt),
    yesPrice,
    noPrice: 1 - yesPrice,
    volumeUsd: Number(formatUnits(BigInt(market.cumulativeQuoteVolume), market.quoteDecimals)),
    liquidityUsd: Number(formatUnits(BigInt(market.backing), market.quoteDecimals)),
    closesAt: expiresAt.toISOString(),
    network: "shannon",
    freshness: {
      observedAt: observedAtIso,
      sourceBlock: Number(sourceBlock),
      staleAfter: new Date(observedAt.getTime() + 10_000).toISOString(),
    },
  };
}

function marketPhase(market: BinaryMarket, now: Date): EventMarket["phase"] {
  if (market.voided || market.status === "Voided") return "voided";
  if (market.finalized || market.status === "Resolved") return "resolved";
  if (Number(market.expiry) * 1_000 <= now.getTime()) return "resolving";
  if (market.status === "Trading") return "trading";
  return "paused";
}
