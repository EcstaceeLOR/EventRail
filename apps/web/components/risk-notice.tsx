import Link from "next/link";

export function RiskNotice({ context }: Readonly<{ context: "trade" | "funding" | "claim" }>) {
  const messages = {
    trade:
      "Prices are probabilities, not promises. A signed order can lose its full cost and state can change before inclusion.",
    funding:
      "Funding routes use live DreamDEX liquidity. Review token approvals, minimum output, and network fees in your wallet.",
    claim:
      "Payouts depend on the DreamDEX contract's finalized oracle result or void rules. Verify the evidence before signing.",
  };
  return (
    <aside className="risk-notice" aria-label={`${context} risk notice`}>
      <strong>Review before signing</strong>
      <span>{messages[context]}</span>
      <Link href="/legal/risk">Read the risk disclosure</Link>
    </aside>
  );
}
