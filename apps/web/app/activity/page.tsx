import type { Metadata } from "next";
import { ActivityLedger } from "../../components/activity-ledger";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <section className="section-wrap page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Durable execution ledger</span>
          <h1>Activity</h1>
          <p>Compare each bounded quote with its realized DreamDEX fill after refresh or reconnect.</p>
        </div>
      </div>
      <ActivityLedger />
    </section>
  );
}
