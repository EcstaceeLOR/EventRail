import { z } from "zod";
import { DataFreshnessSchema, type DataFreshness, type SomniaNetwork } from "@eventrail/types";

export type CacheResource = "market" | "book" | "quote";

export interface CacheIdentity {
  network: SomniaNetwork;
  marketId: string;
  variant?: string;
}

export interface CachePolicy {
  freshForMs: number;
  staleWhileRevalidateMs: number;
}

export const CACHE_POLICIES: Record<CacheResource, CachePolicy> = {
  market: { freshForMs: 5_000, staleWhileRevalidateMs: 25_000 },
  book: { freshForMs: 2_000, staleWhileRevalidateMs: 6_000 },
  quote: { freshForMs: 1_000, staleWhileRevalidateMs: 2_000 },
};

export interface RedisCacheClient {
  get(key: string): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

export interface CacheResult<T> {
  status: "fresh" | "stale" | "miss";
  value: T | null;
  freshness: DataFreshness | null;
  usableForPlanning: boolean;
  cacheKey: string | null;
}

interface StoredEnvelope<T> {
  value: T;
  freshness: DataFreshness;
  freshUntil: string;
  staleUntil: string;
}

const StoredEnvelopeSchema = z.object({
  value: z.unknown(),
  freshness: DataFreshnessSchema,
  freshUntil: z.iso.datetime({ offset: true }),
  staleUntil: z.iso.datetime({ offset: true }),
});

const PUT_IF_NEWER_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
local current = redis.call('GET', KEYS[2])
local shouldSet = current == false
if current ~= false then
  local separator = string.find(current, '|', 1, true)
  local currentBlock = string.sub(current, 1, separator - 1)
  local nextBlock = ARGV[3]
  shouldSet = string.len(nextBlock) > string.len(currentBlock)
    or (string.len(nextBlock) == string.len(currentBlock) and nextBlock >= currentBlock)
end
if shouldSet then
  redis.call('SET', KEYS[2], ARGV[3] .. '|' .. KEYS[1], 'PX', ARGV[2])
  return 1
end
return 0
`;

export class DreamDexRedisCache {
  constructor(
    private readonly redis: RedisCacheClient,
    private readonly clock: () => Date = () => new Date(),
    private readonly onRefreshError: (error: unknown) => void = () => undefined,
  ) {}

  async put<T>(
    resource: CacheResource,
    identity: CacheIdentity,
    value: T,
    freshness: DataFreshness,
    policy: CachePolicy = CACHE_POLICIES[resource],
  ): Promise<string> {
    const checkedFreshness = DataFreshnessSchema.parse(freshness);
    const now = this.clock();
    const hardTtlMs = policy.freshForMs + policy.staleWhileRevalidateMs;
    const envelope: StoredEnvelope<T> = {
      value,
      freshness: checkedFreshness,
      freshUntil: new Date(now.getTime() + policy.freshForMs).toISOString(),
      staleUntil: new Date(now.getTime() + hardTtlMs).toISOString(),
    };
    const cacheKey = dataKey(resource, identity, checkedFreshness.sourceBlock);
    await this.redis.eval(PUT_IF_NEWER_SCRIPT, {
      keys: [cacheKey, latestKey(resource, identity)],
      arguments: [JSON.stringify(envelope), hardTtlMs.toString(), checkedFreshness.sourceBlock],
    });
    return cacheKey;
  }

  async get<T>(
    resource: CacheResource,
    identity: CacheIdentity,
    validate: (value: unknown) => T,
  ): Promise<CacheResult<T>> {
    const pointer = await this.redis.get(latestKey(resource, identity));
    if (!pointer) return miss();
    const separator = pointer.indexOf("|");
    if (separator <= 0) return miss();
    const cacheKey = pointer.slice(separator + 1);
    const serialized = await this.redis.get(cacheKey);
    if (!serialized) return miss();

    try {
      const envelope = StoredEnvelopeSchema.parse(JSON.parse(serialized));
      const value = validate(envelope.value);
      const now = this.clock().getTime();
      const upstreamFreshUntil = Date.parse(envelope.freshness.staleAt);
      const isFresh =
        envelope.freshness.authoritative &&
        envelope.freshness.state === "fresh" &&
        now < Date.parse(envelope.freshUntil) &&
        now < upstreamFreshUntil;
      if (isFresh) {
        return { status: "fresh", value, freshness: envelope.freshness, usableForPlanning: true, cacheKey };
      }
      if (now < Date.parse(envelope.staleUntil)) {
        return { status: "stale", value, freshness: envelope.freshness, usableForPlanning: false, cacheKey };
      }
      return miss();
    } catch {
      return miss();
    }
  }

  async getOrRefresh<T>(
    resource: CacheResource,
    identity: CacheIdentity,
    validate: (value: unknown) => T,
    refresh: () => Promise<{ value: T; freshness: DataFreshness }>,
  ): Promise<CacheResult<T>> {
    const cached = await this.get(resource, identity, validate);
    if (cached.status === "fresh") return cached;
    if (cached.status === "stale") {
      void refresh()
        .then((next) => this.put(resource, identity, next.value, next.freshness))
        .catch(this.onRefreshError);
      return cached;
    }
    const next = await refresh();
    const cacheKey = await this.put(resource, identity, next.value, next.freshness);
    return {
      status: "fresh",
      value: next.value,
      freshness: next.freshness,
      usableForPlanning: true,
      cacheKey,
    };
  }
}

export function dataKey(resource: CacheResource, identity: CacheIdentity, sourceBlock: string): string {
  return `${keyPrefix(resource, identity)}:block:${sourceBlock}`;
}

export function latestKey(resource: CacheResource, identity: CacheIdentity): string {
  return `${keyPrefix(resource, identity)}:latest`;
}

function keyPrefix(resource: CacheResource, identity: CacheIdentity): string {
  const variant = encodeURIComponent(identity.variant ?? "default");
  return `eventrail:v1:${identity.network}:dreamdex:${resource}:${identity.marketId.toLowerCase()}:${variant}`;
}

function miss<T>(): CacheResult<T> {
  return { status: "miss", value: null, freshness: null, usableForPlanning: false, cacheKey: null };
}
