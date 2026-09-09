import type { Metadata } from "next";
import { MarketExplorer } from "../../components/market-explorer";
import { markets } from "../../lib/markets";

export const metadata: Metadata = { title: "Markets" };

export default function MarketsPage() {
  return <section className="section-wrap page-section"><div className="page-heading"><div><span className="eyebrow">Live discovery</span><h1>Event markets</h1><p>Follow the signal, inspect the liquidity, and take a position.</p></div><div className="page-stat"><i /><span><b>{markets.length} markets</b> updating live</span></div></div><MarketExplorer markets={markets} /></section>;
}
