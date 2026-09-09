"use client";

import { useEventRailClient, useToast } from "@eventrail/react";
import type { FundingRoute } from "@eventrail/types";
import Link from "next/link";
import { useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { usePublicClient, useSendTransaction } from "wagmi";
import { useWallet } from "./wallet-provider";

export function FundingConsole({
  initialAmount,
  returnTo,
}: Readonly<{ initialAmount: string; returnTo: string }>) {
  const wallet = useWallet();
  const client = useEventRailClient();
  const publicClient = usePublicClient();
  const transaction = useSendTransaction();
  const toast = useToast();
  const [amount, setAmount] = useState(initialAmount);
  const [route, setRoute] = useState<FundingRoute | null>(null);
  const [stage, setStage] = useState<"idle" | "quoting" | "review" | "signing" | "complete" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);

  async function prepare() {
    if (!wallet.connected) return wallet.openWallet();
    if (!wallet.correctNetwork) return wallet.switchToShannon();
    if (!wallet.address) return;
    try {
      setStage("quoting");
      setError(null);
      const next = await client.createFundingRoute({
        account: wallet.address,
        targetOutputQuantity: parseUnits(amount, 6).toString(),
        maxSlippageBps: 100,
      });
      setRoute(next);
      setStage("review");
    } catch (cause) {
      setStage("error");
      setError(cause instanceof Error ? cause.message : "No DreamDEX spot route is available.");
    }
  }

  async function execute() {
    if (!route || !publicClient || !wallet.address) return;
    try {
      setStage("signing");
      for (const call of route.calls) {
        const request = {
          account: wallet.address,
          to: call.to as Address,
          data: call.data as Hex,
          value: BigInt(call.value),
        };
        await publicClient.call(request);
        const nextHash = await transaction.sendTransactionAsync(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: nextHash });
        if (receipt.status !== "success") throw new Error(`${call.kind} transaction reverted.`);
        setHash(nextHash);
      }
      setStage("complete");
      toast({
        title: "USDso funding confirmed",
        message: "Refresh the trade quote before returning to the event market.",
        tone: "success",
      });
    } catch (cause) {
      setStage("error");
      setError(cause instanceof Error ? cause.message : "Funding did not complete.");
    }
  }

  return (
    <div className="funding-layout">
      <section className="funding-card">
        <span className="eyebrow">Non-custodial funding</span>
        <h2>Swap native liquidity into USDso</h2>
        <p>
          EventRail reads the live SOMI/USDso DreamDEX spot book and prepares an unsigned, expiring IOC route.
          Your wallet signs every call.
        </p>
        <label className="funding-amount">
          Target USDso
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setRoute(null);
              setStage("idle");
            }}
          />
        </label>
        {error ? (
          <div className="ticket-error" role="alert">
            {error}
            <small>This is a real-liquidity route; EventRail does not fabricate a testnet quote.</small>
          </div>
        ) : null}
        {route ? (
          <dl className="funding-summary">
            <div>
              <dt>You provide</dt>
              <dd>
                {formatUnits(BigInt(route.inputQuantity), route.inputDecimals)} {route.inputSymbol}
              </dd>
            </div>
            <div>
              <dt>Minimum received</dt>
              <dd>{formatUnits(BigInt(route.minimumOutputQuantity), route.outputDecimals)} USDso</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{route.source}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{new Date(route.expiresAt).toLocaleTimeString()}</dd>
            </div>
          </dl>
        ) : null}
        {stage === "review" ? (
          <button className="primary-button" type="button" onClick={execute}>
            Simulate and sign {route?.calls.length ?? 0} call{route?.calls.length === 1 ? "" : "s"}
          </button>
        ) : null}
        {stage === "complete" ? (
          <Link className="primary-button" href={returnTo}>
            Return and refresh trade quote
          </Link>
        ) : (
          <button
            className="secondary-button"
            type="button"
            disabled={stage === "quoting" || stage === "signing" || Number(amount) <= 0}
            onClick={prepare}
          >
            {stage === "quoting"
              ? "Reading DreamDEX depth…"
              : stage === "signing"
                ? "Waiting for wallet…"
                : route
                  ? "Refresh route"
                  : wallet.connected
                    ? "Find executable route"
                    : "Connect wallet"}
          </button>
        )}
        {hash ? (
          <a href={`https://shannon-explorer.somnia.network/tx/${hash}`} target="_blank" rel="noreferrer">
            View latest funding transaction ↗
          </a>
        ) : null}
      </section>
      <aside className="funding-explainer">
        <span>Execution boundary</span>
        <strong>Funding and event orders are separate.</strong>
        <p>
          If funding fails or is rejected, EventRail submits no event-contract order. Returning always
          requires a fresh bounded quote.
        </p>
        <ol>
          <li>Read spot depth</li>
          <li>Simulate exact calls</li>
          <li>Wallet signs</li>
          <li>Refresh event quote</li>
        </ol>
      </aside>
    </div>
  );
}
