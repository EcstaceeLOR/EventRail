"use client";

import { useMemo, useState } from "react";

export function TradeTicket({ yesPrice, noPrice }: Readonly<{ yesPrice: number; noPrice: number }>) {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("25");
  const price = side === "yes" ? yesPrice : noPrice;
  const numericAmount = Number(amount) || 0;
  const shares = useMemo(() => (price > 0 ? numericAmount / price : 0), [numericAmount, price]);
  return (
    <aside className="trade-ticket">
      <div className="ticket-heading">
        <div>
          <span>Trade</span>
          <h2>Take a position</h2>
        </div>
        <span className="safe-pill">Non-custodial</span>
      </div>
      <div className="side-toggle">
        <button className={side === "yes" ? "active yes" : ""} type="button" onClick={() => setSide("yes")}>
          Yes <b>{Math.round(yesPrice * 100)}¢</b>
        </button>
        <button className={side === "no" ? "active no" : ""} type="button" onClick={() => setSide("no")}>
          No <b>{Math.round(noPrice * 100)}¢</b>
        </button>
      </div>
      <label className="amount-field">
        <span>Amount</span>
        <div>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="Trade amount"
          />
          <b>USDso</b>
        </div>
      </label>
      <div className="quick-amounts">
        {[10, 25, 50, 100].map((value) => (
          <button type="button" onClick={() => setAmount(String(value))} key={value}>
            ${value}
          </button>
        ))}
      </div>
      <dl className="trade-summary">
        <div>
          <dt>Average price</dt>
          <dd>{Math.round(price * 100)}¢</dd>
        </div>
        <div>
          <dt>Estimated shares</dt>
          <dd>{shares.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Potential payout</dt>
          <dd>${shares.toFixed(2)}</dd>
        </div>
        <div className="profit">
          <dt>Potential profit</dt>
          <dd>+${Math.max(0, shares - numericAmount).toFixed(2)}</dd>
        </div>
      </dl>
      <button className="primary-button ticket-submit" type="button">
        Connect wallet to review
      </button>
      <p className="ticket-note">
        Your wallet signs the final DreamDEX transaction. EventRail never holds your funds.
      </p>
    </aside>
  );
}
