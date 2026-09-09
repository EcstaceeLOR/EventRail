"use client";

import { useMarkets } from "@eventrail/react";
import Link from "next/link";
import { MarketCountdown } from "./market-countdown";

export function LiveLandingPreview() {
  const markets = useMarkets();
  const market = markets.query.data?.[0];
  const probability =
    market?.lastPrice === null || market?.lastPrice === undefined
      ? 0.5
      : Number(market.lastPrice) / 10 ** market.collateralDecimals;
  const href = market ? `/markets/${market.marketId}` : "/markets";
  return (
    <div className="hero-visual" aria-label="Live DreamDEX market preview" aria-live="polite">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="spotlight-card">
        <div className="spotlight-header">
          <span>{market?.asset ?? "DreamDEX Event Contracts"}</span>
          <span className={`live-chip ${markets.state !== "live" ? "live-chip--muted" : ""}`}>
            <i /> {markets.state === "live" ? "Live" : markets.state}
          </span>
        </div>
        <h2>{market?.question ?? "Explore real-time outcome markets on Somnia"}</h2>
        <div className="big-probability">
          <strong>{Math.round(probability * 100)}%</strong>
          <span>Up probability</span>
        </div>
        <svg
          className="hero-chart"
          viewBox="0 0 520 150"
          role="img"
          aria-label="Illustrative probability trend"
        >
          <defs>
            <linearGradient id="liveArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#74fbc0" stopOpacity=".34" />
              <stop offset="1" stopColor="#74fbc0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 120 C45 118 50 100 92 105 S160 82 197 91 S252 46 300 65 S358 74 398 42 S465 34 520 8 L520 150 L0 150 Z"
            fill="url(#liveArea)"
          />
          <path
            d="M0 120 C45 118 50 100 92 105 S160 82 197 91 S252 46 300 65 S358 74 398 42 S465 34 520 8"
            fill="none"
            stroke="#74fbc0"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        {market ? (
          <div className="preview-lock">
            <span>Locks in</span>
            <MarketCountdown expiresAt={market.expiresAt} />
          </div>
        ) : null}
        <div className="spotlight-actions">
          <Link href={href} className="yes-button">
            Trade Up <b>{Math.round(probability * 100)}¢</b>
          </Link>
          <Link href={href} className="no-button">
            Trade Down <b>{Math.round((1 - probability) * 100)}¢</b>
          </Link>
        </div>
      </div>
    </div>
  );
}
