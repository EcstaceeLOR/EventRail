import { createPublicClient, http, type Hex } from "viem";
import type { NormalizedMarket, NormalizedOrderBook } from "@eventrail/types";
import type { DreamDexReadAdapter } from "./adapter.js";
import type { DreamDexContractRegistry } from "./registry.js";

export interface RpcEndpoint {
  name: string;
  getBlockNumber(): Promise<bigint>;
}

export interface RpcEndpointHealth {
  name: string;
  state: "healthy" | "degraded" | "open";
  consecutiveFailures: number;
  blockNumber: string | null;
  lagBlocks: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  circuitOpenUntil: string | null;
}

export interface ResilientRpcOptions {
  timeoutMs?: number;
  failureThreshold?: number;
  circuitCooldownMs?: number;
  clock?: () => Date;
}

interface MutableHealth {
  failures: number;
  block: bigint | null;
  lastSuccess: Date | null;
  lastError: Date | null;
  openUntil: Date | null;
}

export class RpcUnavailableError extends Error {
  constructor(readonly failures: readonly unknown[]) {
    super("Every configured Somnia RPC endpoint failed or has an open circuit");
    this.name = "RpcUnavailableError";
  }
}

export class ReorgDetectedError extends Error {
  constructor(
    readonly blockNumber: bigint,
    readonly previousHash: Hex,
    readonly nextHash: Hex,
  ) {
    super(`Somnia reorg detected at block ${blockNumber}`);
    this.name = "ReorgDetectedError";
  }
}

export class ResilientRpcRouter {
  readonly #health = new Map<string, MutableHealth>();
  readonly #canonicalHashes = new Map<bigint, Hex>();
  readonly #timeoutMs: number;
  readonly #failureThreshold: number;
  readonly #circuitCooldownMs: number;
  readonly #clock: () => Date;
  #reorgDetected = false;

  constructor(
    private readonly endpoints: readonly RpcEndpoint[],
    options: ResilientRpcOptions = {},
  ) {
    if (endpoints.length === 0) throw new Error("At least one Somnia RPC endpoint is required");
    this.#timeoutMs = options.timeoutMs ?? 3_000;
    this.#failureThreshold = options.failureThreshold ?? 3;
    this.#circuitCooldownMs = options.circuitCooldownMs ?? 30_000;
    this.#clock = options.clock ?? (() => new Date());
    for (const endpoint of endpoints) {
      this.#health.set(endpoint.name, {
        failures: 0,
        block: null,
        lastSuccess: null,
        lastError: null,
        openUntil: null,
      });
    }
  }

  async getBlockNumber(): Promise<bigint> {
    const failures: unknown[] = [];
    for (const endpoint of this.endpoints) {
      const health = this.#state(endpoint.name);
      if (health.openUntil && health.openUntil.getTime() > this.#clock().getTime()) continue;
      try {
        const block = await withTimeout(endpoint.getBlockNumber(), this.#timeoutMs, endpoint.name);
        health.failures = 0;
        health.block = block;
        health.lastSuccess = this.#clock();
        health.openUntil = null;
        this.#updateLag();
        return block;
      } catch (error) {
        failures.push(error);
        health.failures += 1;
        health.lastError = this.#clock();
        if (health.failures >= this.#failureThreshold) {
          health.openUntil = new Date(this.#clock().getTime() + this.#circuitCooldownMs);
        }
      }
    }
    throw new RpcUnavailableError(failures);
  }

  recordCanonicalBlock(blockNumber: bigint, hash: Hex): void {
    const previous = this.#canonicalHashes.get(blockNumber);
    if (previous && previous.toLowerCase() !== hash.toLowerCase()) {
      this.#reorgDetected = true;
      throw new ReorgDetectedError(blockNumber, previous, hash);
    }
    this.#canonicalHashes.set(blockNumber, hash);
    if (this.#canonicalHashes.size > 256) {
      const oldest = [...this.#canonicalHashes.keys()].sort((a, b) => (a < b ? -1 : 1))[0];
      if (oldest !== undefined) this.#canonicalHashes.delete(oldest);
    }
  }

  clearReorgFlag(): void {
    this.#reorgDetected = false;
  }

  isWriteSafe(maxLagBlocks = 2n): boolean {
    if (this.#reorgDetected) return false;
    return this.getHealth().some(
      (endpoint) =>
        endpoint.state === "healthy" &&
        endpoint.lagBlocks !== null &&
        BigInt(endpoint.lagBlocks) <= maxLagBlocks,
    );
  }

  getHeadBlock(): bigint | null {
    const blocks = [...this.#health.values()].flatMap((health) =>
      health.block === null ? [] : [health.block],
    );
    return blocks.reduce<bigint | null>(
      (highest, block) => (highest === null || block > highest ? block : highest),
      null,
    );
  }

  getHealth(): readonly RpcEndpointHealth[] {
    const now = this.#clock();
    const head = this.getHeadBlock();
    return this.endpoints.map((endpoint) => {
      const health = this.#state(endpoint.name);
      const open = health.openUntil !== null && health.openUntil.getTime() > now.getTime();
      return {
        name: endpoint.name,
        state: open ? "open" : health.failures > 0 ? "degraded" : "healthy",
        consecutiveFailures: health.failures,
        blockNumber: health.block?.toString() ?? null,
        lagBlocks: head === null || health.block === null ? null : (head - health.block).toString(),
        lastSuccessAt: health.lastSuccess?.toISOString() ?? null,
        lastErrorAt: health.lastError?.toISOString() ?? null,
        circuitOpenUntil: open ? (health.openUntil?.toISOString() ?? null) : null,
      };
    });
  }

  #state(name: string): MutableHealth {
    const health = this.#health.get(name);
    if (!health) throw new Error(`Unknown RPC endpoint ${name}`);
    return health;
  }

  #updateLag(): void {
    void this.getHeadBlock();
  }
}

export function createResilientRpcRouter(registry: DreamDexContractRegistry): ResilientRpcRouter {
  const endpoints = registry.rpcUrls.map((url, index) => {
    const client = createPublicClient({ chain: registry.chain, transport: http(url) });
    return {
      name: index === 0 ? "primary" : `fallback-${index}`,
      getBlockNumber: () => client.getBlockNumber(),
    };
  });
  return new ResilientRpcRouter(endpoints);
}

export interface ReconnectOptions<T> {
  signal?: AbortSignal;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  onStatus?: (status: "connected" | "reconnecting" | "stopped") => void;
  onValue: (value: T) => Promise<void> | void;
}

export async function runReconnectingStream<T>(
  connect: () => Promise<AsyncIterable<T>>,
  options: ReconnectOptions<T>,
): Promise<void> {
  const base = options.baseDelayMs ?? 250;
  const max = options.maxDelayMs ?? 15_000;
  const sleep =
    options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let attempts = 0;
  while (!options.signal?.aborted) {
    try {
      const stream = await connect();
      options.onStatus?.("connected");
      for await (const value of stream) {
        if (options.signal?.aborted) break;
        attempts = 0;
        await options.onValue(value);
      }
      if (options.signal?.aborted) break;
      throw new Error("Stream ended before cancellation");
    } catch {
      if (options.signal?.aborted) break;
      options.onStatus?.("reconnecting");
      const delay = Math.min(max, base * 2 ** attempts);
      attempts += 1;
      await sleep(delay);
    }
  }
  options.onStatus?.("stopped");
}

export type UnsafeWriteCode =
  | "MARKET_NOT_FOUND"
  | "MARKET_NOT_TRADING"
  | "STALE_STATE"
  | "NON_AUTHORITATIVE_STATE"
  | "STATE_LAG"
  | "RPC_UNHEALTHY"
  | "STREAM_UNHEALTHY";

export class UnsafeWriteError extends Error {
  constructor(
    readonly code: UnsafeWriteCode,
    message: string,
  ) {
    super(message);
    this.name = "UnsafeWriteError";
  }
}

export interface WriteGuardOptions {
  clock?: () => Date;
  maxLagBlocks?: bigint;
  streamHealthy?: () => boolean;
}

export interface AuthoritativeWriteSnapshot {
  market: NormalizedMarket;
  book: NormalizedOrderBook;
  chainHead: bigint;
}

export class AuthoritativeWriteGuard {
  readonly #clock: () => Date;
  readonly #maxLagBlocks: bigint;
  readonly #streamHealthy: () => boolean;

  constructor(
    private readonly reader: Pick<DreamDexReadAdapter, "getMarket" | "getOrderBook">,
    private readonly rpc: ResilientRpcRouter,
    options: WriteGuardOptions = {},
  ) {
    this.#clock = options.clock ?? (() => new Date());
    this.#maxLagBlocks = options.maxLagBlocks ?? 2n;
    this.#streamHealthy = options.streamHealthy ?? (() => true);
  }

  async planWrite<T>(
    marketId: string,
    planner: (snapshot: AuthoritativeWriteSnapshot) => Promise<T> | T,
    signal?: AbortSignal,
  ): Promise<T> {
    const [market, book, chainHead] = await Promise.all([
      this.reader.getMarket(marketId, signal),
      this.reader.getOrderBook(marketId, 25, signal),
      this.rpc.getBlockNumber(),
    ]);
    if (!market || !book) throw new UnsafeWriteError("MARKET_NOT_FOUND", `No DreamDEX market ${marketId}`);
    if (market.status !== "trading")
      throw new UnsafeWriteError("MARKET_NOT_TRADING", `Market ${marketId} is ${market.status}`);
    if (!this.rpc.isWriteSafe(this.#maxLagBlocks))
      throw new UnsafeWriteError("RPC_UNHEALTHY", "RPC health is unsafe for writes");
    if (!this.#streamHealthy())
      throw new UnsafeWriteError("STREAM_UNHEALTHY", "DreamDEX event stream is reconnecting");
    assertWriteFreshness(market, this.#clock());
    assertWriteFreshness(book, this.#clock());
    const marketBlock = BigInt(market.freshness.sourceBlock);
    const bookBlock = BigInt(book.freshness.sourceBlock);
    if (chainHead - marketBlock > this.#maxLagBlocks || chainHead - bookBlock > this.#maxLagBlocks) {
      throw new UnsafeWriteError("STATE_LAG", "DreamDEX indexer or book state lags the canonical chain head");
    }
    return planner({ market, book, chainHead });
  }
}

function assertWriteFreshness(value: { freshness: NormalizedMarket["freshness"] }, now: Date): void {
  if (!value.freshness.authoritative) {
    throw new UnsafeWriteError(
      "NON_AUTHORITATIVE_STATE",
      "Write planning requires authoritative on-chain state",
    );
  }
  if (value.freshness.state !== "fresh" || Date.parse(value.freshness.staleAt) <= now.getTime()) {
    throw new UnsafeWriteError("STALE_STATE", "Write planning requires fresh on-chain state");
  }
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, endpoint: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${endpoint} timed out after ${milliseconds}ms`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
