"use client";

import { useActivity } from "@eventrail/react";
import { useState } from "react";
import { formatUnits } from "viem";
import { useWallet } from "./wallet-provider";

export function ActivityLedger() {
  const wallet = useWallet();
  const [status, setStatus] = useState("");
  const [marketId, setMarketId] = useState("");
  const activity = useActivity(wallet.address ?? "", {
    ...(status ? { status } : {}),
    ...(marketId ? { marketId } : {}),
  });
  if (!wallet.connected) {
    return (
      <div className="data-state">
        <strong>Connect your wallet</strong>
        <p>Activity is scoped to your public address and never includes signing secrets.</p>
        <button className="primary-button" onClick={wallet.openWallet} type="button">
          Connect wallet
        </button>
      </div>
    );
  }
  return (
    <div className="activity-ledger">
      <div className="activity-filters">
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All states</option>
            <option value="planned">Planned</option>
            <option value="filled">Filled</option>
            <option value="partially_filled">Partially filled</option>
            <option value="unfilled">Unfilled</option>
            <option value="reverted">Reverted</option>
          </select>
        </label>
        <label>
          Market ID
          <input
            value={marketId}
            onChange={(event) => setMarketId(event.target.value.trim())}
            placeholder="0x…"
          />
        </label>
        <label>
          Type
          <select disabled>
            <option>Trade</option>
          </select>
        </label>
      </div>
      {activity.state === "loading" ? <div className="visual-empty">Loading durable activity…</div> : null}
      {activity.state === "offline" ? (
        <div className="inline-notice">
          Activity is temporarily unavailable. On-chain transactions are unaffected.
        </div>
      ) : null}
      {activity.query.data?.length === 0 ? (
        <div className="visual-empty">
          <strong>No matching activity</strong>
          <span>Quotes become durable when an executable plan is created.</span>
        </div>
      ) : null}
      <div className="activity-list">
        {activity.query.data?.map((item) => (
          <article className="activity-row" key={item.planId}>
            <div>
              <span className={`activity-state activity-state--${item.state}`}>
                {item.state.replaceAll("_", " ")}
              </span>
              <strong>
                {item.side.toUpperCase()} {item.outcome.toUpperCase()}
              </strong>
              <code>{item.marketId.slice(0, 12)}…</code>
            </div>
            <dl>
              <div>
                <dt>Quoted</dt>
                <dd>
                  {formatUnits(BigInt(item.quotedQuantity), 6)} @ {formatUnits(BigInt(item.quotedPrice), 6)}
                </dd>
              </div>
              <div>
                <dt>Realized</dt>
                <dd>
                  {formatUnits(BigInt(item.realizedQuantity), 6)} @{" "}
                  {item.realizedAveragePrice ? formatUnits(BigInt(item.realizedAveragePrice), 6) : "—"}
                </dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{new Date(item.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
            {item.transactionHash ? (
              <a
                href={`https://shannon-explorer.somnia.network/tx/${item.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction ↗
              </a>
            ) : (
              <span className="muted-copy">Not broadcast</span>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
