"use client";

import { useMarkets } from "@eventrail/react";
import type { NormalizedMarket } from "@eventrail/types";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { LiveMarketCard } from "./live-market-card";
import { MarketCountdown } from "./market-countdown";

type View = "cards" | "table";

export function LiveMarketExplorer() {
  const markets = useMarkets();
  const [asset, setAsset] = useState("all");
  const [cadence, setCadence] = useState("all");
  const [view, setView] = useState<View>("cards");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    setAsset(params.get("asset") ?? "all");
    setCadence(params.get("cadence") ?? "all");
    setView(params.get("view") === "table" ? "table" : "cards");
    setQuery(params.get("q") ?? "");
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (asset !== "all") params.set("asset", asset);
    if (cadence !== "all") params.set("cadence", cadence);
    if (query) params.set("q", query);
    if (view !== "cards") params.set("view", view);
    globalThis.history.replaceState(
      null,
      "",
      `${globalThis.location.pathname}${params.size ? `?${params}` : ""}`,
    );
  }, [asset, cadence, query, view]);

  const rows = markets.query.data ?? [];
  const assets = ["all", ...new Set(rows.map((market) => market.asset))];
  const cadences = ["all", ...new Set(rows.map((market) => market.cadence.intervalSeconds))];
  const filtered = useMemo(
    () =>
      rows.filter(
        (market) =>
          (asset === "all" || market.asset === asset) &&
          (cadence === "all" || market.cadence.intervalSeconds === cadence) &&
          market.question.toLowerCase().includes(deferredQuery.trim().toLowerCase()),
      ),
    [asset, cadence, deferredQuery, rows],
  );

  if (markets.state === "loading") return <MarketSkeleton />;
  if (markets.state === "offline" && rows.length === 0) {
    return (
      <div className="data-state data-state--error">
        <span>Gateway offline</span>
        <h2>Live markets could not be reached.</h2>
        <p>Your filters are preserved. Retry when the connection returns.</p>
        <button type="button" onClick={() => markets.query.refetch()}>
          Retry connection
        </button>
      </div>
    );
  }
  return (
    <div className="live-explorer">
      <div className="market-filter-rail">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search live contracts"
            aria-label="Search live contracts"
          />
        </label>
        <label>
          <span>Asset</span>
          <select value={asset} onChange={(event) => setAsset(event.target.value)}>
            {assets.map((value) => (
              <option value={value} key={value}>
                {value === "all" ? "All assets" : value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Cadence</span>
          <select value={cadence} onChange={(event) => setCadence(event.target.value)}>
            {cadences.map((value) => (
              <option value={value} key={value}>
                {value === "all" ? "All windows" : cadenceLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <div className="view-toggle" aria-label="Market view">
          <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} type="button">
            Cards
          </button>
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} type="button">
            Table
          </button>
        </div>
      </div>
      {markets.state === "stale" ? (
        <div className="inline-notice">Showing the last verified block while live data reconnects.</div>
      ) : null}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <h2>No live contracts match</h2>
          <p>Reset the asset, cadence, or search filters.</p>
          <button
            type="button"
            onClick={() => {
              setAsset("all");
              setCadence("all");
              setQuery("");
            }}
          >
            Reset filters
          </button>
        </div>
      ) : view === "cards" ? (
        <div className="market-grid market-page-grid">
          {filtered.map((market) => (
            <LiveMarketCard market={market} key={market.marketId} />
          ))}
        </div>
      ) : (
        <MarketTable markets={filtered} />
      )}
    </div>
  );
}

function MarketTable({ markets }: Readonly<{ markets: readonly NormalizedMarket[] }>) {
  return (
    <div className="market-table-wrap">
      <table className="market-table">
        <thead>
          <tr>
            <th>Contract</th>
            <th>Probability</th>
            <th>Volume</th>
            <th>Depth</th>
            <th>Locks</th>
            <th>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {markets.map((market) => {
            const price =
              market.lastPrice === null ? 0.5 : Number(market.lastPrice) / 10 ** market.collateralDecimals;
            return (
              <tr key={market.marketId}>
                <td>
                  <span>{market.asset}</span>
                  <Link href={`/markets/${market.marketId}`}>{market.question}</Link>
                </td>
                <td>
                  <strong>{Math.round(price * 100)}% Up</strong>
                </td>
                <td>{formatRaw(market.cumulativeQuoteVolume, market.collateralDecimals)}</td>
                <td>{formatRaw(market.backing, market.collateralDecimals)}</td>
                <td>
                  <MarketCountdown expiresAt={market.expiresAt} />
                </td>
                <td>
                  <Link className="market-enter" href={`/markets/${market.marketId}`}>
                    Open →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MarketSkeleton() {
  return (
    <div className="market-grid market-page-grid" aria-label="Loading live markets">
      {[0, 1, 2, 3, 4, 5].map((value) => (
        <div className="market-card market-skeleton" key={value}>
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

function cadenceLabel(seconds: string) {
  const value = Number(seconds);
  if (value % 3600 === 0) return `${value / 3600}h`;
  return `${value / 60}m`;
}

function formatRaw(value: string, decimals: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(formatUnits(BigInt(value), decimals)),
  );
}
