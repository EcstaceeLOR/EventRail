import type { Metadata } from "next";
import { LiveMarketExplorer } from "../../components/live-market-explorer";

export const metadata: Metadata = { title: "Markets" };

export default function MarketsPage() {
  return (
    <section className="section-wrap page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Live discovery</span>
          <h1>Event markets</h1>
          <p>Follow the signal, inspect the liquidity, and take a position.</p>
        </div>
        <div className="page-stat">
          <i />
          <span>
            <b>DreamDEX contracts</b> updating live
          </span>
        </div>
      </div>
      <LiveMarketExplorer />
    </section>
  );
}
