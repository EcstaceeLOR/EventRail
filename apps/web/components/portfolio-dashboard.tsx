"use client";

import { summarizePortfolio } from "@eventrail/core";
import { useActivity, usePositions } from "@eventrail/react";
import type { PortfolioPosition } from "@eventrail/types";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { OracleEvidencePanel } from "./oracle-evidence";
import { WalletEmptyState } from "./wallet-empty-state";
import { useWallet } from "./wallet-provider";

export function PortfolioDashboard() {
  const wallet = useWallet();
  const portfolio = usePositions(wallet.address ?? "");
  const activity = useActivity(wallet.address ?? "");
  const [asset, setAsset] = useState("all");
  const [cadence, setCadence] = useState("all");
  const [status, setStatus] = useState("all");
  const positions = portfolio.query.data ?? [];
  const assets = useMemo(() => [...new Set(positions.map((position) => position.asset))].sort(), [positions]);
  const cadences = useMemo(
    () => [...new Set(positions.map((position) => position.cadence.intervalSeconds))].sort(),
    [positions],
  );
  const filtered = positions.filter(
    (position) =>
      (asset === "all" || position.asset === asset) &&
      (cadence === "all" || position.cadence.intervalSeconds === cadence) &&
      (status === "all" || position.claimStatus === status || position.status === status),
  );
  const summary = summarizePortfolio(positions);

  if (!wallet.connected || !wallet.correctNetwork) return <WalletEmptyState kind="portfolio" />;
  if (portfolio.state === "loading") return <PortfolioSkeleton />;
  if (portfolio.state === "offline") {
    return (
      <div className="data-state">
        <span>Gateway offline</span>
        <h2>Portfolio data is temporarily unavailable</h2>
        <p>Your positions remain on Somnia. Retry when the DreamDEX data gateway reconnects.</p>
        <button type="button" onClick={() => portfolio.query.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  if (positions.length === 0) {
    return (
      <div className="data-state">
        <span>Connected · no exposure</span>
        <h2>Your first event position starts here</h2>
        <p>Choose a live DreamDEX market, review an executable quote, and sign from your wallet.</p>
        <Link className="primary-button" href="/markets">
          Explore live markets
        </Link>
      </div>
    );
  }

  return (
    <div className="portfolio-dashboard">
      {portfolio.state === "stale" ? (
        <div className="inline-notice">Showing the latest retained snapshot while live data catches up.</div>
      ) : null}
      <section className="portfolio-summary" aria-label="Portfolio summary">
        <Metric label="Portfolio value" value={money(summary.totalMarkValue, summary.collateralDecimals)} />
        <Metric
          label="Unrealized P&amp;L"
          value={money(summary.totalUnrealizedPnl, summary.collateralDecimals, true)}
        />
        <Metric
          label="Realized P&amp;L"
          value={money(summary.totalRealizedPnl, summary.collateralDecimals, true)}
        />
        <Metric
          label="Ready to claim"
          value={money(summary.claimablePayout, summary.collateralDecimals)}
          accent
        />
      </section>

      <div className="portfolio-filter-rail">
        <label>
          Asset
          <select value={asset} onChange={(event) => setAsset(event.target.value)}>
            <option value="all">All assets</option>
            {assets.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Cadence
          <select value={cadence} onChange={(event) => setCadence(event.target.value)}>
            <option value="all">All cadences</option>
            {cadences.map((value) => (
              <option key={value} value={value}>
                {cadenceLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All states</option>
            <option value="trading">Open</option>
            <option value="locked">Locked</option>
            <option value="claimable">Claimable</option>
            <option value="no_value">Settled · no value</option>
          </select>
        </label>
        <span>
          {filtered.length} outcome {filtered.length === 1 ? "position" : "positions"}
        </span>
      </div>

      <div className="position-list">
        {filtered.map((position) => (
          <PositionCard key={`${position.marketId}:${position.outcome}`} position={position} />
        ))}
        {filtered.length === 0 ? (
          <div className="visual-empty">
            <strong>No matching positions</strong>
            <span>Change one or more filters.</span>
          </div>
        ) : null}
      </div>

      <section className="portfolio-activity">
        <div className="panel-title">
          <div>
            <span className="eyebrow">Recent activity</span>
            <h2>Execution history</h2>
          </div>
          <Link href="/activity">View ledger →</Link>
        </div>
        {activity.query.data?.slice(0, 4).map((item) => (
          <div className="portfolio-activity-row" key={item.planId}>
            <span className={`activity-state activity-state--${item.state}`}>
              {item.state.replaceAll("_", " ")}
            </span>
            <strong>
              {item.side.toUpperCase()} {item.outcome.toUpperCase()}
            </strong>
            <code>{item.marketId.slice(0, 12)}…</code>
            <time>{new Date(item.updatedAt).toLocaleString()}</time>
          </div>
        ))}
        {activity.query.data?.length === 0 ? <p className="muted-copy">No recorded executions yet.</p> : null}
      </section>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <article className={accent ? "portfolio-metric portfolio-metric--accent" : "portfolio-metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>USDso · exact contract units</small>
    </article>
  );
}

function PositionCard({ position }: { position: PortfolioPosition }) {
  const mark = position.resolution.state === "unresolved" ? position.markValue : position.settlementPayout;
  return (
    <article className="position-card">
      <div className="position-card-main">
        <div>
          <span className={`outcome-chip outcome-chip--${position.outcome}`}>{position.outcome}</span>
          <span className="position-asset">
            {position.asset} · {cadenceLabel(position.cadence.intervalSeconds)}
          </span>
        </div>
        <Link href={`/markets/${position.marketId}`}>{position.question}</Link>
        <code>{position.marketId.slice(0, 14)}…</code>
      </div>
      <dl>
        <div>
          <dt>Contracts</dt>
          <dd>{compactUnits(position.balance, position.collateralDecimals)}</dd>
        </div>
        <div>
          <dt>Avg entry</dt>
          <dd>
            {position.averageEntryPrice
              ? compactUnits(position.averageEntryPrice, position.collateralDecimals)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>{position.resolution.state === "unresolved" ? "Live value" : "Payout"}</dt>
          <dd>{money(mark, position.collateralDecimals)}</dd>
        </div>
        <div>
          <dt>Unrealized</dt>
          <dd>{money(position.unrealizedPnl, position.collateralDecimals, true)}</dd>
        </div>
      </dl>
      <div className="position-state">
        <span className={`activity-state activity-state--${position.claimStatus}`}>
          {position.claimStatus.replaceAll("_", " ")}
        </span>
        {position.claimStatus === "claimable" ? (
          <Link href="/claims">Claim funds →</Link>
        ) : (
          <span>{position.status}</span>
        )}
      </div>
      <OracleEvidencePanel
        marketId={position.marketId}
        resolution={position.resolution}
        evidence={position.oracleEvidence}
        compact
      />
    </article>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="portfolio-skeleton" aria-label="Loading portfolio">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

function compactUnits(value: string, decimals: number) {
  const formatted = formatUnits(BigInt(value), decimals);
  const [whole, fraction = ""] = formatted.split(".");
  return fraction ? `${whole}.${fraction.slice(0, 4).replace(/0+$/, "") || "0"}` : whole;
}

function money(value: string | null, decimals: number | null, signed = false) {
  if (value === null || decimals === null) return "—";
  const amount = BigInt(value);
  const prefix = signed && amount > BigInt(0) ? "+" : "";
  return `${prefix}${compactUnits(amount.toString(), decimals)} USDso`;
}

function cadenceLabel(seconds: string) {
  const value = BigInt(seconds);
  return value % BigInt(3600) === BigInt(0)
    ? `${value / BigInt(3600)}h`
    : value % BigInt(60) === BigInt(0)
      ? `${value / BigInt(60)}m`
      : `${value}s`;
}
