import type { Metadata } from "next";

export const metadata: Metadata = { title: "System status" };

const services = ["Public API", "Market indexer", "Realtime stream", "Transaction planner", "Somnia RPC"];
export default function StatusPage() {
  return <section className="section-wrap page-section narrow-page"><div className="status-banner"><i /><div><span>All systems operational</span><small>Last checked moments ago</small></div></div><div className="page-heading"><div><span className="eyebrow">System status</span><h1>EventRail services</h1><p>Current availability of the data and transaction-planning pipeline.</p></div></div><div className="service-list">{services.map((service) => <div key={service}><span>{service}</span><b><i /> Operational</b></div>)}</div><p className="prototype-note">Live health telemetry will replace this scaffold when the gateway and workers are deployed.</p></section>;
}
