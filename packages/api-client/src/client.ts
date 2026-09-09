import {
  DataStreamEventSchema,
  EventMarketSchema,
  ExecutableQuoteSchema,
  HealthStatusSchema,
  MarketSeriesSchema,
  NormalizedCandleSchema,
  NormalizedClaimSchema,
  NormalizedFillSchema,
  NormalizedMarketSchema,
  NormalizedOrderBookSchema,
  NormalizedPositionSchema,
  OutcomeBalancesSchema,
  TransactionPlanSchema,
  type DataStreamEvent,
  type EventMarket,
  type ExecutableQuote,
  type HealthStatus,
  type MarketSeries,
  type NormalizedCandle,
  type NormalizedClaim,
  type NormalizedFill,
  type NormalizedMarket,
  type NormalizedOrderBook,
  type NormalizedPosition,
  type OutcomeBalances,
  type SomniaNetwork,
  type TransactionPlan,
} from "@eventrail/types";
import type { ZodType } from "zod";

export interface EventRailClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  reconnectDelayMs?: number;
}

export interface EventSubscription {
  network?: SomniaNetwork;
  cursor?: string;
  signal?: AbortSignal;
}

export interface SseEventRecord {
  cursor: string;
  event: DataStreamEvent;
}

export class EventRailClient {
  readonly #baseUrl: string;
  readonly #apiKey: string | undefined;
  readonly #fetch: typeof globalThis.fetch;
  readonly #reconnectDelayMs: number;

  constructor(options: EventRailClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#reconnectDelayMs = options.reconnectDelayMs ?? 2_000;
  }

  health(signal?: AbortSignal): Promise<HealthStatus> {
    return this.#request("/v1/health", HealthStatusSchema, optionalSignal(signal));
  }

  listMarkets(signal?: AbortSignal): Promise<readonly EventMarket[]> {
    return this.#request("/v1/markets", EventMarketSchema.array(), optionalSignal(signal));
  }

  listSeries(network: SomniaNetwork = "shannon", signal?: AbortSignal): Promise<readonly MarketSeries[]> {
    return this.#request(
      `/v1/data/series?network=${network}`,
      MarketSeriesSchema.array(),
      optionalSignal(signal),
    );
  }

  getMarket(marketId: string, signal?: AbortSignal): Promise<NormalizedMarket> {
    return this.#request(
      `/v1/data/markets/${encodeURIComponent(marketId)}`,
      NormalizedMarketSchema,
      optionalSignal(signal),
    );
  }

  getOrderBook(marketId: string, signal?: AbortSignal): Promise<NormalizedOrderBook> {
    return this.#request(
      `/v1/data/markets/${encodeURIComponent(marketId)}/book`,
      NormalizedOrderBookSchema,
      optionalSignal(signal),
    );
  }

  getTrades(marketId: string, signal?: AbortSignal): Promise<readonly NormalizedFill[]> {
    return this.#request(
      `/v1/data/markets/${encodeURIComponent(marketId)}/trades`,
      NormalizedFillSchema.array(),
      optionalSignal(signal),
    );
  }

  getCandles(
    marketId: string,
    intervalSeconds: number,
    signal?: AbortSignal,
  ): Promise<readonly NormalizedCandle[]> {
    return this.#request(
      `/v1/data/markets/${encodeURIComponent(marketId)}/candles?intervalSeconds=${intervalSeconds}`,
      NormalizedCandleSchema.array(),
      optionalSignal(signal),
    );
  }

  getBalances(account: string, marketId: string, signal?: AbortSignal): Promise<OutcomeBalances> {
    return this.#request(
      `/v1/data/accounts/${encodeURIComponent(account)}/balances/${encodeURIComponent(marketId)}`,
      OutcomeBalancesSchema,
      optionalSignal(signal),
    );
  }

  getPositions(account: string, signal?: AbortSignal): Promise<readonly NormalizedPosition[]> {
    return this.#request(
      `/v1/data/accounts/${encodeURIComponent(account)}/positions`,
      NormalizedPositionSchema.array(),
      optionalSignal(signal),
    );
  }

  getClaims(account: string, signal?: AbortSignal): Promise<readonly NormalizedClaim[]> {
    return this.#request(
      `/v1/data/accounts/${encodeURIComponent(account)}/claims`,
      NormalizedClaimSchema.array(),
      optionalSignal(signal),
    );
  }

  getQuote(
    marketId: string,
    outcome: "up" | "down",
    side: "buy" | "sell",
    quantity: string,
    signal?: AbortSignal,
  ): Promise<ExecutableQuote> {
    const query = new URLSearchParams({ outcome, side, quantity });
    return this.#request(
      `/v1/data/markets/${encodeURIComponent(marketId)}/quote?${query}`,
      ExecutableQuoteSchema,
      optionalSignal(signal),
    );
  }

  planTrade(
    input: { marketId: string; outcome: "yes" | "no"; amountUsdso: string; account: `0x${string}` },
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<TransactionPlan> {
    return this.#request("/v1/transaction-plans/trades", TransactionPlanSchema, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify(input),
      ...optionalSignal(signal),
    });
  }

  async *subscribeEvents(options: EventSubscription = {}): AsyncGenerator<SseEventRecord> {
    const network = options.network ?? "shannon";
    let cursor = options.cursor;
    while (!options.signal?.aborted) {
      const headers = this.#headers();
      headers.set("accept", "text/event-stream");
      if (cursor) headers.set("last-event-id", cursor);
      try {
        const response = await this.#fetch(`${this.#baseUrl}/v1/events?network=${network}`, {
          headers,
          ...optionalSignal(options.signal),
        });
        if (!response.ok) throw await EventRailApiError.fromResponse(response);
        if (!response.body) throw new EventRailProtocolError("SSE response has no body");
        for await (const record of parseEventStream(response.body)) {
          cursor = record.cursor;
          yield record;
          if (options.signal?.aborted) return;
        }
      } catch (error) {
        if (options.signal?.aborted || isAbortError(error)) return;
        if (error instanceof EventRailApiError && error.status >= 400 && error.status < 500) throw error;
      }
      if (!options.signal?.aborted) await abortableDelay(this.#reconnectDelayMs, options.signal);
    }
  }

  async #request<T>(path: string, schema: ZodType<T>, init: RequestInit = {}): Promise<T> {
    const headers = this.#headers(init.headers);
    if (init.body) headers.set("content-type", "application/json");
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw await EventRailApiError.fromResponse(response);
    const payload: unknown = await response.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new EventRailProtocolError(`Invalid response for ${path}`, parsed.error);
    return parsed.data;
  }

  #headers(initial?: HeadersInit): Headers {
    const headers = new Headers(initial);
    headers.set("accept", "application/json");
    if (this.#apiKey) headers.set("authorization", `Bearer ${this.#apiKey}`);
    return headers;
  }
}

export class EventRailApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message || `EventRail API request failed with status ${status}`);
    this.name = "EventRailApiError";
  }

  static async fromResponse(response: Response): Promise<EventRailApiError> {
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Keep a non-JSON error body as text.
    }
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : text;
    return new EventRailApiError(response.status, message, body);
  }
}

export class EventRailProtocolError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "EventRailProtocolError";
  }
}

export async function* parseEventStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEventRecord> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const record = parseFrame(frame);
        if (record) yield record;
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): SseEventRecord | null {
  let cursor = "";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("id:")) cursor = line.slice(3).trimStart();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!cursor || data.length === 0) return null;
  return { cursor, event: DataStreamEventSchema.parse(JSON.parse(data.join("\n"))) };
}

function optionalSignal(signal?: AbortSignal): Pick<RequestInit, "signal"> {
  return signal ? { signal } : {};
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
