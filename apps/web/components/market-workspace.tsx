"use client";

import { useCandles, useMarket, useOrderBook, useResolution, useSeries, useTrades } from "@eventrail/react";
import Link from "next/link";
import { formatUnits } from "viem";
import type { DisplayMarket } from "../lib/markets";
import { MarketCountdown } from "./market-countdown";
import { OracleEvidencePanel } from "./oracle-evidence";
import { DepthVisualization, ProbabilityChart, RecentFills } from "./market-visualizations";
import { TradeTicket } from "./trade-ticket";
import { RiskNotice } from "./risk-notice";

export function MarketWorkspace({
  marketId,
  fallback,
}: Readonly<{ marketId: string; fallback: DisplayMarket | undefined }>) {
  const isDreamDexId = /^0x[0-9a-fA-F]{64}$/.test(marketId);
  const market = useMarket(isDreamDexId ? marketId : "");
  const resolution = useResolution(isDreamDexId ? marketId : "");
  const book = useOrderBook(isDreamDexId ? marketId : "");
  const trades = useTrades(isDreamDexId ? marketId : "");
  const candles = useCandles(isDreamDexId ? marketId : "", 60);
  const series = useSeries();

  if (!isDreamDexId && fallback) return <PreviewWorkspace market={fallback} />;
  if (market.state === "loading") return <WorkspaceSkeleton />;
  if (!market.query.data) {
    return (
      <div className="data-state data-state--error">
        <span>Market unavailable</span>
        <h1>This DreamDEX generation could not be loaded.</h1>
        <p>
          The URL remains bound to the requested market. Return to discovery to find the current generation.
        </p>
        <Link className="primary-button" href="/markets">
          Open live markets
        </Link>
      </div>
    );
  }

  const value = market.query.data;
  const last = value.lastPrice === null ? 0.5 : Number(value.lastPrice) / 10 ** value.collateralDecimals;
  const successor = series.query.data?.find(
    (item) => item.seriesKey === value.cadence.seriesKey && item.currentMarketId !== value.marketId,
  );
  const terminal = value.status !== "trading";
  return (
    <section className="section-wrap page-section market-workspace">
      <div className="breadcrumbs">
        <Link href="/markets">Markets</Link>
        <span>/</span>
        <span>{value.asset}</span>
        <span>/</span>
        <code>{value.marketId.slice(0, 10)}…</code>
      </div>
      {market.state === "stale" || market.state === "offline" ? (
        <div className="inline-notice">
          Live updates are interrupted. Trading is disabled until authoritative state returns.
        </div>
      ) : null}
      <RiskNotice context="trade" />
      {terminal ? (
        <div className={`market-phase-banner market-phase-banner--${value.status}`}>
          <div>
            <span>{value.status}</span>
            <strong>{phaseMessage(value.status)}</strong>
          </div>
          {successor ? (
            <Link href={`/markets/${successor.currentMarketId}`}>Open current generation →</Link>
          ) : (
            <Link href="/markets">Find a live market →</Link>
          )}
        </div>
      ) : null}
      <div className="market-detail-layout">
        <main className="market-main">
          <header className="detail-heading">
            <div className="detail-kicker">
              <span className="category-pill">{value.asset}</span>
              <span className="generation-id">Immutable generation</span>
            </div>
            <h1>{value.question}</h1>
            <div className="detail-meta">
              <span>
                <i className="live-dot" /> {value.status}
              </span>
              <span>
                Locks in <MarketCountdown expiresAt={value.expiresAt} />
              </span>
              <span>Block {value.freshness.sourceBlock}</span>
            </div>
          </header>
          <section className="chart-card" aria-labelledby="probability-title">
            <div className="panel-title">
              <div>
                <span className="eyebrow">Probability</span>
                <h2 id="probability-title">Up over time</h2>
              </div>
              <span className="source-chip">DreamDEX fills · 60s</span>
            </div>
            <ProbabilityChart candles={candles.query.data ?? []} decimals={value.collateralDecimals} />
          </section>
          <div className="trading-data-grid">
            <section className="data-panel" aria-labelledby="depth-title">
              <div className="panel-title">
                <div>
                  <span className="eyebrow">Liquidity</span>
                  <h2 id="depth-title">Executable depth</h2>
                </div>
                {book.query.data?.upBids[0] && book.query.data.upAsks[0] ? (
                  <span className="source-chip">
                    Spread{" "}
                    {formatProbability(
                      BigInt(book.query.data.upAsks[0].price) - BigInt(book.query.data.upBids[0].price),
                      value.collateralDecimals,
                    )}
                  </span>
                ) : null}
              </div>
              <DepthVisualization book={book.query.data} />
            </section>
            <section className="data-panel" aria-labelledby="fills-title">
              <div className="panel-title">
                <div>
                  <span className="eyebrow">Tape</span>
                  <h2 id="fills-title">Recent fills</h2>
                </div>
                <span className="source-chip">Live</span>
              </div>
              <RecentFills fills={trades.query.data ?? []} decimals={value.collateralDecimals} />
            </section>
          </div>
          <section className="market-rules">
            <div>
              <span className="eyebrow">Resolution contract</span>
              <h2>What decides this market</h2>
              <p>
                {value.oracle}. The immutable market ID above remains the identity after its pool is reused by
                a later window.
              </p>
            </div>
            <dl>
              <div>
                <dt>Opening reference</dt>
                <dd>{value.resolution.openingPrice ?? "Pending"}</dd>
              </div>
              <div>
                <dt>Resolution</dt>
                <dd>{value.resolution.resolutionPrice ?? "Pending"}</dd>
              </div>
              <div>
                <dt>Backing</dt>
                <dd>{formatUnits(BigInt(value.backing), value.collateralDecimals)} USDso</dd>
              </div>
              <div>
                <dt>Current Up</dt>
                <dd>{Math.round(last * 100)}%</dd>
              </div>
            </dl>
          </section>
          <OracleEvidencePanel
            marketId={value.marketId}
            resolution={resolution.query.data?.resolution ?? value.resolution}
            evidence={resolution.query.data?.evidence ?? null}
          />
        </main>
        {!terminal && market.state === "live" ? (
          <TradeTicket key={value.marketId} yesPrice={last} noPrice={1 - last} market={value} />
        ) : (
          <aside className="trade-ticket trade-ticket--locked">
            <span className="eyebrow">Trading unavailable</span>
            <h2>{market.state === "live" ? "This window is closed" : "Waiting for verified state"}</h2>
            <p>No quote or wallet prompt can be created from a locked, stale, or offline market.</p>
            {successor ? (
              <Link className="primary-button ticket-submit" href={`/markets/${successor.currentMarketId}`}>
                Open successor
              </Link>
            ) : null}
          </aside>
        )}
      </div>
    </section>
  );
}

function PreviewWorkspace({ market }: Readonly<{ market: DisplayMarket }>) {
  return (
    <section className="section-wrap page-section">
      <RiskNotice context="trade" />
      <div className="preview-banner">
        <span>Product preview</span>
        <p>
          This editorial market demonstrates the interface. Choose a bytes32 DreamDEX market from live
          discovery to trade.
        </p>
        <Link href="/markets">Open live markets →</Link>
      </div>
      <div className="market-detail-layout">
        <main className="market-main">
          <header className="detail-heading">
            <span className="category-pill">{market.category}</span>
            <h1>{market.question}</h1>
            <div className="detail-meta">
              <span>Reference market</span>
              <span>{Math.round(market.yesPrice * 100)}% Yes</span>
            </div>
          </header>
          <div className="chart-card">
            <div className="visual-empty">
              <strong>Live DreamDEX data is intentionally not fabricated.</strong>
              <span>Open a current event contract to see probability, depth, and fills.</span>
            </div>
          </div>
        </main>
        <TradeTicket yesPrice={market.yesPrice} noPrice={market.noPrice} />
      </div>
    </section>
  );
}

function WorkspaceSkeleton() {
  return (
    <section className="section-wrap page-section workspace-skeleton" aria-label="Loading DreamDEX market">
      <i />
      <i />
      <i />
    </section>
  );
}

function phaseMessage(status: string) {
  if (status === "resolved") return "Outcome finalized. Review positions and claims.";
  if (status === "voided") return "Market voided. Both outcome claims follow the contract policy.";
  if (status === "locked" || status === "settling") return "Trading has stopped while the outcome resolves.";
  return "This market generation is not accepting orders.";
}

function formatProbability(value: bigint, decimals: number) {
  return `${(Number(formatUnits(value, decimals)) * 100).toFixed(2)}%`;
}
