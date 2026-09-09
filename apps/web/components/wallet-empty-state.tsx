"use client";

import Link from "next/link";
import { useState } from "react";

export function WalletEmptyState({ kind }: Readonly<{ kind: "portfolio" | "claims" }>) {
  const [connecting, setConnecting] = useState(false);
  const isPortfolio = kind === "portfolio";
  return (
    <div className="wallet-empty">
      <div className="empty-illustration" aria-hidden="true"><span /><span /><span /></div>
      <span className="eyebrow">Wallet view</span>
      <h2>{isPortfolio ? "Your conviction, all in one place" : "Resolved outcomes, ready when you are"}</h2>
      <p>{isPortfolio ? "Connect a wallet to see open positions, entry prices, live value, and transaction history across DreamDEX markets." : "Connect a wallet to discover settled positions and prepare safe, inspectable claim transactions."}</p>
      <button className="primary-button" type="button" onClick={() => { setConnecting(true); window.setTimeout(() => setConnecting(false), 900); }}>{connecting ? "Finding wallets…" : "Connect wallet"}</button>
      <Link href="/markets">Browse markets without connecting →</Link>
    </div>
  );
}
