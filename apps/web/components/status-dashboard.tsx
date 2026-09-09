"use client";

import type { HealthStatus } from "@eventrail/types";
import { useCallback, useEffect, useState } from "react";

const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:4000";
const services = [
  ["Public API", null],
  ["Market indexer", "rpc_lag_blocks"],
  ["Realtime stream", "stream_connected"],
  ["Transaction planner", "planning_enabled"],
  ["Settlement scanner", "settlement_backlog"],
] as const;

export function StatusDashboard() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      const response = await fetch(`${gatewayUrl}/v1/health`, { cache: "no-store" });
      if (!response.ok) throw new Error("health unavailable");
      setHealth((await response.json()) as HealthStatus);
    } catch {
      setHealth(null);
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  return (
    <section className="section-wrap page-section narrow-page" aria-live="polite">
      <div
        className={`status-banner ${health?.status === "degraded" || error ? "status-banner--degraded" : ""}`}
      >
        <i />
        <div>
          <span>
            {error ? "Telemetry unavailable" : health ? statusLabel(health.status) : "Checking systems…"}
          </span>
          <small>
            {health
              ? `Updated ${new Date(health.timestamp).toLocaleTimeString()}`
              : "No signing action is required"}
          </small>
        </div>
      </div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">System status</span>
          <h1>EventRail services</h1>
          <p>Live safety state for the data and transaction-planning pipeline.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void load()}
          disabled={!health && !error}
        >
          Refresh
        </button>
      </div>
      <div className="service-list" aria-busy={!health && !error}>
        {services.map(([service, metric]) => {
          const operational = health ? serviceOperational(metric, health) : false;
          return (
            <div key={service}>
              <span>{service}</span>
              <b className={operational ? "" : "service-degraded"}>
                <i /> {health ? (operational ? "Operational" : "Degraded") : "Unknown"}
              </b>
            </div>
          );
        })}
      </div>
      {health?.alerts?.length ? (
        <div className="status-alerts" role="alert">
          <h2>Active notices</h2>
          {health.alerts.map((alert) => (
            <p key={alert.code}>{alert.message}</p>
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="data-state">
          <span>Recovery mode</span>
          <p>
            Operational telemetry could not be reached. Treat transaction planning as unavailable until health
            returns.
          </p>
          <button type="button" onClick={() => void load()}>
            Retry health check
          </button>
        </div>
      ) : null}
    </section>
  );
}

function statusLabel(status: HealthStatus["status"]) {
  return status === "ok" ? "All systems operational" : "Some systems degraded";
}

function serviceOperational(metric: (typeof services)[number][1], health: HealthStatus) {
  if (health.status === "degraded" && metric === null) return false;
  if (!metric || !health.metrics) return health.status === "ok";
  const value = health.metrics[metric];
  if (metric === "rpc_lag_blocks") return value !== undefined && value <= 5;
  if (metric === "settlement_backlog") return value !== undefined && value <= 100;
  return value === 1;
}
