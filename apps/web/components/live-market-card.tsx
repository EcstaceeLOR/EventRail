"use client";

import type { NormalizedMarket } from "@eventrail/types";
import Link from "next/link";
import { formatUnits } from "viem";
import { MarketCountdown } from "./market-countdown";

export function LiveMarketCard({ market }: Readonly<{ market: NormalizedMarket }>) {
  const one = 10 ** market.collateralDecimals;
  const up = market.lastPrice === null ? 0.5 : Number(market.lastPrice) / one;
  const down = 1 - up;
  const tradable = market.status === "trading";
  return (
    <article className="market-card live-market-card">
      <div className="market-card-top">
        <span className="category-pill">{market.asset}</span>
        <span className={`market-status market-status--${market.status}`}>
          <i /> {market.status}
        </span>
      </div>
      <Link href={`/markets/${market.marketId}`} className="market-question">
        <h3>{market.question}</h3>
      </Link>
      <div className="market-probabilities">
        <span className="yes-button">
          Up <b>{Math.round(up * 100)}¢</b>
        </span>
        <span className="no-button">
          Down <b>{Math.round(down * 100)}¢</b>
        </span>
      </div>
      <div className="market-card-stats">
        <span>
          {formatCompact(formatUnits(BigInt(market.cumulativeQuoteVolume), market.collateralDecimals))} volume
        </span>
        <span>{formatCompact(formatUnits(BigInt(market.backing), market.collateralDecimals))} depth</span>
      </div>
      <div className="market-card-footer">
        <span>
          <small>Locks in</small>
          <MarketCountdown expiresAt={market.expiresAt} />
        </span>
        {tradable ? (
          <Link href={`/markets/${market.marketId}`} className="market-enter">
            Trade →
          </Link>
        ) : (
          <span className="market-locked">Trading locked</span>
        )}
      </div>
    </article>
  );
}

function formatCompact(value: string) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value),
  );
}
