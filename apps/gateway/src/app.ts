import Fastify from "fastify";
import { z } from "zod";
import { quoteExecutableDepth } from "@eventrail/core";
import type { DreamDexReadAdapter } from "@eventrail/dreamdex-adapter";
import type { EventBusRecord } from "@eventrail/redis";
import {
  MarketSeriesSchema,
  type HealthStatus,
  type MarketSeries,
  type NormalizedMarket,
  type SomniaNetwork,
} from "@eventrail/types";

export interface PublicEventStream {
  subscribe(options: {
    network: SomniaNetwork;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<EventBusRecord>;
}

export interface GatewayOptions {
  eventStream?: PublicEventStream;
  dataReader?: DreamDexReadAdapter;
  heartbeatMs?: number;
}

const EventQuerySchema = z.object({ network: z.enum(["shannon", "mainnet"]).default("shannon") });
const MarketParamsSchema = z.object({ marketId: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });
const AccountParamsSchema = z.object({ account: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });
const BalanceParamsSchema = AccountParamsSchema.extend({ marketId: MarketParamsSchema.shape.marketId });
const CandleQuerySchema = z.object({ intervalSeconds: z.coerce.number().int().positive() });
const QuoteQuerySchema = z.object({
  outcome: z.enum(["up", "down"]),
  side: z.enum(["buy", "sell"]),
  quantity: z.string().regex(/^[1-9][0-9]*$/),
});

export function createGateway(options: GatewayOptions = {}) {
  const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.headers.cookie"] } });

  app.get("/v1/health", async (): Promise<HealthStatus> => ({
    status: "ok",
    service: "eventrail-gateway",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  }));

  app.get("/v1/markets", async () => []);

  app.get("/v1/data/series", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { network } = EventQuerySchema.parse(request.query);
    const markets = (await options.dataReader.listLiveMarkets(request.signal)).filter(
      (market) => market.network === network,
    );
    return buildSeries(markets);
  });

  app.get("/v1/data/markets/:marketId", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    const market = await options.dataReader.getMarket(marketId, request.signal);
    return market ?? reply.code(404).send({ error: "Market not found" });
  });

  app.get("/v1/data/markets/:marketId/book", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    const book = await options.dataReader.getOrderBook(marketId, 25, request.signal);
    return book ?? reply.code(404).send({ error: "Market not found" });
  });

  app.get("/v1/data/markets/:marketId/trades", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    return options.dataReader.getFills(marketId, { limit: 100, signal: request.signal });
  });

  app.get("/v1/data/markets/:marketId/candles", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    const { intervalSeconds } = CandleQuerySchema.parse(request.query);
    return options.dataReader.getCandles(marketId, intervalSeconds, { limit: 500, signal: request.signal });
  });

  app.get("/v1/data/markets/:marketId/quote", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { marketId } = MarketParamsSchema.parse(request.params);
    const quote = QuoteQuerySchema.parse(request.query);
    const book = await options.dataReader.getOrderBook(marketId, 100, request.signal);
    if (!book) return reply.code(404).send({ error: "Market not found" });
    return quoteExecutableDepth(book, quote);
  });

  app.get("/v1/data/accounts/:account/positions", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { account } = AccountParamsSchema.parse(request.params);
    return options.dataReader.getPositions(account, request.signal);
  });

  app.get("/v1/data/accounts/:account/claims", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { account } = AccountParamsSchema.parse(request.params);
    return options.dataReader.getClaims(account, request.signal);
  });

  app.get("/v1/data/accounts/:account/balances/:marketId", async (request, reply) => {
    if (!options.dataReader) return reply.code(503).send({ error: "DreamDEX data is unavailable" });
    const { account, marketId } = BalanceParamsSchema.parse(request.params);
    const balances = await options.dataReader.getOutcomeBalances(account, marketId, request.signal);
    return balances ?? reply.code(404).send({ error: "Market not found" });
  });

  app.get("/v1/events", async (request, reply) => {
    if (!options.eventStream) return reply.code(503).send({ error: "Event stream is unavailable" });
    const query = EventQuerySchema.parse(request.query);
    const headerCursor = request.headers["last-event-id"];
    const cursor = Array.isArray(headerCursor) ? headerCursor[0] : headerCursor;
    const controller = new AbortController();
    request.raw.once("close", () => controller.abort());
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 2000\n\n");
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), options.heartbeatMs ?? 15_000);
    heartbeat.unref();
    try {
      for await (const record of options.eventStream.subscribe({
        network: query.network,
        ...(cursor ? { cursor } : {}),
        signal: controller.signal,
      })) {
        reply.raw.write(formatSseRecord(record));
      }
    } finally {
      clearInterval(heartbeat);
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  });

  return app;
}

export function formatSseRecord(record: EventBusRecord): string {
  return `id: ${record.cursor}\nevent: ${record.event.type}\ndata: ${JSON.stringify(record.event)}\n\n`;
}

export function buildSeries(markets: readonly NormalizedMarket[]): readonly MarketSeries[] {
  const grouped = new Map<string, NormalizedMarket[]>();
  for (const market of markets) {
    const rows = grouped.get(market.cadence.seriesKey) ?? [];
    rows.push(market);
    grouped.set(market.cadence.seriesKey, rows);
  }
  return [...grouped.entries()].map(([seriesKey, generations]) => {
    const sorted = generations.sort(
      (left, right) => Date.parse(right.tradingStart) - Date.parse(left.tradingStart),
    );
    const current = sorted[0];
    if (!current) throw new Error(`Series ${seriesKey} has no current market`);
    return MarketSeriesSchema.parse({
      network: current.network,
      venue: "dreamdex",
      seriesKey,
      asset: current.asset,
      intervalSeconds: current.cadence.intervalSeconds,
      currentMarketId: current.marketId,
      currentStatus: current.status,
      generationCount: generations.length.toString(),
      freshness: current.freshness,
    });
  });
}
