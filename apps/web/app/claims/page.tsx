import type { Metadata } from "next";
import { WalletEmptyState } from "../../components/wallet-empty-state";

export const metadata: Metadata = { title: "Claims" };

export default function ClaimsPage() {
  return <section className="section-wrap page-section"><div className="page-heading"><div><span className="eyebrow">Settlement desk</span><h1>Claims</h1><p>Verify outcomes and redeem settled DreamDEX positions.</p></div><span className="safe-pill">Oracle-aware</span></div><WalletEmptyState kind="claims" /></section>;
}
