import Link from "next/link";
import type { DisplayMarket } from "../lib/markets";
import { formatUsd } from "../lib/markets";

export function MarketCard({ market }: Readonly<{ market: DisplayMarket }>) {
  return (
    <article className="market-card">
      <div className="market-card-top"><span className="category-pill">{market.category}</span><span className={market.change >= 0 ? "change positive" : "change negative"}>{market.change >= 0 ? "+" : ""}{market.change}%</span></div>
      <Link href={`/markets/${market.id}`} className="market-question"><h3>{market.question}</h3></Link>
      <div className="market-probabilities"><span className="yes-button">Yes <b>{Math.round(market.yesPrice * 100)}¢</b></span><span className="no-button">No <b>{Math.round(market.noPrice * 100)}¢</b></span></div>
      <div className="market-card-stats"><span>{formatUsd(market.volumeUsd)} volume</span><span>{market.traders.toLocaleString()} traders</span></div>
    </article>
  );
}
