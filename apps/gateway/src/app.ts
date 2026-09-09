import Fastify from "fastify";
import { z } from "zod";
import type { EventBusRecord } from "@eventrail/redis";
import type { HealthStatus, SomniaNetwork } from "@eventrail/types";

export interface PublicEventStream {
  subscribe(options: {
    network: SomniaNetwork;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<EventBusRecord>;
}

export interface GatewayOptions {
  eventStream?: PublicEventStream;
  heartbeatMs?: number;
}

const EventQuerySchema = z.object({ network: z.enum(["shannon", "mainnet"]).default("shannon") });

export function createGateway(options: GatewayOptions = {}) {
  const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.headers.cookie"] } });

  app.get("/v1/health", async (): Promise<HealthStatus> => ({
    status: "ok",
    service: "eventrail-gateway",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  }));

  app.get("/v1/markets", async () => []);

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
