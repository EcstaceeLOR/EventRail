import type { Metadata } from "next";
import { PortfolioDashboard } from "../../components/portfolio-dashboard";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <section className="section-wrap page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your positions</span>
          <h1>Portfolio</h1>
          <p>Live value, exposure, and performance across every event.</p>
        </div>
      </div>
      <PortfolioDashboard />
    </section>
  );
}
