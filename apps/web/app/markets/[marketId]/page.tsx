import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TradeTicket } from "../../../components/trade-ticket";
import { formatUsd, markets } from "../../../lib/markets";

interface MarketPageProps { params: Promise<{ marketId: string }> }

export async function generateMetadata({ params }: MarketPageProps): Promise<Metadata> {
  const { marketId } = await params;
  const market = markets.find((item) => item.id === marketId);
  return { title: market?.question ?? "Market" };
}

export default async function MarketDetailPage({ params }: MarketPageProps) {
  const { marketId } = await params;
  const market = markets.find((item) => item.id === marketId);
  if (!market) notFound();
  return (
    <section className="section-wrap page-section">
      <div className="breadcrumbs"><Link href="/markets">Markets</Link><span>/</span><span>{market.category}</span></div>
      <div className="market-detail-layout">
        <div className="market-main">
          <div className="detail-heading"><span className="category-pill">{market.category}</span><h1>{market.question}</h1><div className="detail-meta"><span><i className="live-dot" /> Trading</span><span>{formatUsd(market.volumeUsd)} volume</span><span>{market.traders.toLocaleString()} traders</span></div></div>
          <div className="chart-card"><div className="chart-toolbar"><div><strong>{Math.round(market.yesPrice * 100)}%</strong><span>Yes probability</span></div><div className="range-tabs"><button>1H</button><button>1D</button><button className="active">1W</button><button>ALL</button></div></div><svg viewBox="0 0 900 300" role="img" aria-label="Seven day market probability chart"><defs><linearGradient id="detailArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#74fbc0" stopOpacity=".28"/><stop offset="1" stopColor="#74fbc0" stopOpacity="0"/></linearGradient></defs><path d="M0 248 C70 210 90 231 142 206 S238 224 291 175 S380 193 429 145 S522 171 577 119 S687 136 735 79 S829 91 900 36 L900 300 L0 300Z" fill="url(#detailArea)"/><path d="M0 248 C70 210 90 231 142 206 S238 224 291 175 S380 193 429 145 S522 171 577 119 S687 136 735 79 S829 91 900 36" fill="none" stroke="#74fbc0" strokeWidth="5" strokeLinecap="round"/></svg><div className="chart-axis"><span>Sep 02</span><span>Sep 04</span><span>Sep 06</span><span>Today</span></div></div>
          <div className="detail-grid"><article className="info-card"><span className="eyebrow">Resolution</span><h2>Market rules</h2><p>This market resolves using the source and conditions published by the underlying DreamDEX event contract. EventRail will surface the oracle evidence before a claim is prepared.</p><dl><div><dt>Closes</dt><dd>{new Date(market.closesAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</dd></div><div><dt>Settlement</dt><dd>DreamDEX oracle</dd></div></dl></article><article className="info-card"><span className="eyebrow">Order book</span><h2>Market depth</h2><div className="depth-row"><span>Yes liquidity</span><b>{formatUsd(market.liquidityUsd * market.yesPrice)}</b></div><div className="depth-bar"><span style={{ width: `${market.yesPrice * 100}%` }} /></div><div className="depth-row"><span>No liquidity</span><b>{formatUsd(market.liquidityUsd * market.noPrice)}</b></div></article></div>
        </div>
        <TradeTicket yesPrice={market.yesPrice} noPrice={market.noPrice} />
      </div>
    </section>
  );
}
