export type OperationalMetric =
  | "rpc_lag_blocks"
  | "cache_age_seconds"
  | "stream_connected"
  | "plan_failures_total"
  | "confirmation_latency_ms"
  | "settlement_backlog"
  | "planning_enabled";

export interface OperationalAlert {
  code: string;
  severity: "warning" | "critical";
  message: string;
}

const SENSITIVE_KEY = /authorization|cookie|token|signature|secret|private.?key|mnemonic|seed.?phrase/i;

export function redactTelemetry(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redactTelemetry(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redactTelemetry(childValue, childKey),
      ]),
    );
  }
  return value;
}

export function structuredEvent(
  event: string,
  correlationId: string,
  attributes: Record<string, unknown> = {},
  now = new Date(),
): Record<string, unknown> {
  return {
    timestamp: now.toISOString(),
    level: "info",
    event,
    correlationId,
    attributes: redactTelemetry(attributes),
  };
}

export class OperationalMonitor {
  constructor(private readonly version = "0.1.0") {}

  readonly #metrics = new Map<OperationalMetric, number>([
    ["rpc_lag_blocks", 0],
    ["cache_age_seconds", 0],
    ["stream_connected", 1],
    ["plan_failures_total", 0],
    ["confirmation_latency_ms", 0],
    ["settlement_backlog", 0],
    ["planning_enabled", 1],
  ]);

  set(name: OperationalMetric, value: number): void {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative number.`);
    this.#metrics.set(name, value);
  }

  increment(name: OperationalMetric, by = 1): void {
    this.set(name, (this.#metrics.get(name) ?? 0) + by);
  }

  alerts(): OperationalAlert[] {
    const alerts: OperationalAlert[] = [];
    if ((this.#metrics.get("planning_enabled") ?? 0) === 0)
      alerts.push({
        code: "PLANNING_DISABLED",
        severity: "critical",
        message: "Transaction planning is disabled.",
      });
    if ((this.#metrics.get("stream_connected") ?? 0) === 0)
      alerts.push({
        code: "STREAM_DISCONNECTED",
        severity: "critical",
        message: "Realtime ingestion is disconnected.",
      });
    if ((this.#metrics.get("rpc_lag_blocks") ?? 0) > 5)
      alerts.push({ code: "RPC_LAG", severity: "critical", message: "RPC/indexer lag exceeds five blocks." });
    if ((this.#metrics.get("cache_age_seconds") ?? 0) > 15)
      alerts.push({
        code: "STALE_CACHE",
        severity: "warning",
        message: "Market cache age exceeds 15 seconds.",
      });
    if ((this.#metrics.get("settlement_backlog") ?? 0) > 100)
      alerts.push({
        code: "SETTLEMENT_BACKLOG",
        severity: "warning",
        message: "Settlement backlog exceeds 100 markets.",
      });
    return alerts;
  }

  snapshot(now = new Date()) {
    const alerts = this.alerts();
    const metrics = Object.fromEntries(this.#metrics);
    return {
      status: alerts.some((alert) => alert.severity === "critical") ? ("degraded" as const) : ("ok" as const),
      service: "eventrail-gateway",
      version: this.version,
      timestamp: now.toISOString(),
      planningEnabled: metrics.planning_enabled === 1,
      metrics,
      alerts,
    };
  }

  prometheus(): string {
    return [...this.#metrics]
      .map(([name, value]) => `# TYPE eventrail_${name} gauge\neventrail_${name} ${value}`)
      .join("\n");
  }
}
