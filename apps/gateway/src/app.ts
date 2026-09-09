import Fastify from "fastify";
import type { HealthStatus } from "@eventrail/types";

export function createGateway() {
  const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.headers.cookie"] } });

  app.get("/v1/health", async (): Promise<HealthStatus> => ({
    status: "ok",
    service: "eventrail-gateway",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  }));

  app.get("/v1/markets", async () => []);

  return app;
}
