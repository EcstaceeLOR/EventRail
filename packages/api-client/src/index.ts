import type { EventMarket, HealthStatus, TransactionPlan } from "@eventrail/types";

export interface EventRailClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
}

export class EventRailClient {
  readonly #baseUrl: string;
  readonly #apiKey: string | undefined;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: EventRailClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  health(): Promise<HealthStatus> {
    return this.#request("/v1/health");
  }

  listMarkets(): Promise<readonly EventMarket[]> {
    return this.#request("/v1/markets");
  }

  planTrade(input: { marketId: string; outcome: "yes" | "no"; amountUsdso: string; account: `0x${string}` }): Promise<TransactionPlan> {
    return this.#request("/v1/transactions/trade", { method: "POST", body: JSON.stringify(input) });
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (this.#apiKey) headers.set("authorization", `Bearer ${this.#apiKey}`);
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw new EventRailApiError(response.status, await response.text());
    return response.json() as Promise<T>;
  }
}

export class EventRailApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message || `EventRail API request failed with status ${status}`);
    this.name = "EventRailApiError";
  }
}
