"use client";

import { erc6909Abi } from "@somnia-chain/markets-sdk";
import { Button, useEventRailClient, usePositions, useToast } from "@eventrail/react";
import type { PortfolioPosition, RedemptionPlan } from "@eventrail/types";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUnits, type Address, type Hex } from "viem";
import { usePublicClient, useSendTransaction } from "wagmi";
import { OracleEvidencePanel } from "./oracle-evidence";
import { WalletEmptyState } from "./wallet-empty-state";
import { useWallet } from "./wallet-provider";

type ClaimStage = "idle" | "preparing" | "approving" | "redeeming" | "confirming" | "claimed" | "error";

export function ClaimsCenter() {
  const wallet = useWallet();
  const positions = usePositions(wallet.address ?? "");
  const client = useEventRailClient();
  const publicClient = usePublicClient();
  const transaction = useSendTransaction();
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | PortfolioPosition["claimStatus"]>("all");
  const [stages, setStages] = useState<Record<string, ClaimStage>>({});
  const [receipts, setReceipts] = useState<Record<string, Hex>>({});
  const rows = positions.query.data ?? [];
  const settled = rows.filter((position) => position.resolution.state !== "unresolved");
  const markets = useMemo(() => groupByMarket(settled), [settled]);
  const visible = markets.filter(
    (group) => filter === "all" || group.some((position) => position.claimStatus === filter),
  );
  const total = settled
    .filter((position) => position.claimStatus === "claimable")
    .reduce((sum, position) => sum + BigInt(position.settlementPayout), BigInt(0));

  if (!wallet.connected || !wallet.correctNetwork) return <WalletEmptyState kind="claims" />;
  if (positions.state === "loading")
    return (
      <div className="portfolio-skeleton">
        <i />
        <i />
        <i />
      </div>
    );
  if (positions.state === "offline")
    return (
      <div className="data-state">
        <span>Scanner offline</span>
        <h2>Claims could not be refreshed</h2>
        <p>No transaction will be prepared from stale settlement state.</p>
        <button type="button" onClick={() => positions.query.refetch()}>
          Retry
        </button>
      </div>
    );

  async function redeem(group: readonly PortfolioPosition[]) {
    const marketId = group[0]?.marketId;
    if (!marketId || !wallet.address || !publicClient) return;
    try {
      setStages((current) => ({ ...current, [marketId]: "preparing" }));
      const plan = await client.createRedemptionPlan({ account: wallet.address, marketId });
      assertPlan(plan, wallet.address, publicClient.chain.id);
      const [approval, redemption] = plan.calls;
      if (!approval || !redemption) throw new Error("The redemption plan is incomplete.");
      const approved = await publicClient.readContract({
        address: plan.outcomeTokenAddress as Address,
        abi: erc6909Abi,
        functionName: "isOperator",
        args: [wallet.address, plan.moduleAddress as Address],
      });
      if (!approved) {
        setStages((current) => ({ ...current, [marketId]: "approving" }));
        await publicClient.call({
          account: wallet.address,
          to: approval.to as Address,
          data: approval.data as Hex,
        });
        const approvalHash = await transaction.sendTransactionAsync({
          to: approval.to as Address,
          data: approval.data as Hex,
          gas: BigInt(approval.gas),
        });
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") throw new Error("Outcome-token approval reverted.");
      }
      setStages((current) => ({ ...current, [marketId]: "redeeming" }));
      await publicClient.call({
        account: wallet.address,
        to: redemption.to as Address,
        data: redemption.data as Hex,
      });
      const hash = await transaction.sendTransactionAsync({
        to: redemption.to as Address,
        data: redemption.data as Hex,
        gas: BigInt(redemption.gas),
      });
      setStages((current) => ({ ...current, [marketId]: "confirming" }));
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("DreamDEX redemption reverted.");
      setReceipts((current) => ({ ...current, [marketId]: hash }));
      setStages((current) => ({ ...current, [marketId]: "claimed" }));
      await positions.query.refetch();
      toast({ title: "Claim complete", message: "USDso was paid directly to your wallet.", tone: "success" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Redemption did not complete.";
      setStages((current) => ({ ...current, [marketId]: "error" }));
      toast({ title: "Claim paused safely", message, tone: "error" });
    }
  }

  return (
    <div className="claims-center">
      <section className="claim-hero-card">
        <div>
          <span>Available now</span>
          <strong>{formatUnits(total, settled[0]?.collateralDecimals ?? 6)} USDso</strong>
          <small>Calculated from finalized DreamDEX payout vectors</small>
        </div>
        <div className="claim-batch">
          <span>Batch claims</span>
          <strong>Coming next</strong>
          <small>Individual market redemption is live.</small>
        </div>
      </section>
      <nav className="claim-tabs" aria-label="Claim states">
        {(["all", "claimable", "pending", "claimed", "no_value"] as const).map((value) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
            type="button"
          >
            {value.replaceAll("_", " ")}
          </button>
        ))}
      </nav>
      {visible.length === 0 ? (
        <div className="data-state">
          <span>Nothing here</span>
          <h2>No {filter === "all" ? "settled" : filter.replaceAll("_", " ")} positions</h2>
          <p>EventRail scans finalized market generations even after they leave the live list.</p>
          <Link href="/portfolio">Review portfolio →</Link>
        </div>
      ) : null}
      <div className="claim-list">
        {visible.map((group) => {
          const first = group[0]!;
          const stage = stages[first.marketId] ?? "idle";
          const claimable = group.filter((position) => position.claimStatus === "claimable");
          const payout = claimable.reduce(
            (sum, position) => sum + BigInt(position.settlementPayout),
            BigInt(0),
          );
          const pending = !["idle", "claimed", "error"].includes(stage);
          return (
            <article className="claim-card" key={first.marketId}>
              <header>
                <div>
                  <span className="position-asset">
                    {first.asset} · {new Date(first.expiresAt).toLocaleString()}
                  </span>
                  <Link href={`/markets/${first.marketId}`}>{first.question}</Link>
                </div>
                <span
                  className={`activity-state activity-state--${stage === "claimed" ? "claimed" : first.resolution.state}`}
                >
                  {stage === "idle" ? first.resolution.state : stage}
                </span>
              </header>
              <div className="claim-legs">
                {group.map((position) => (
                  <div key={position.outcome}>
                    <span className={`outcome-chip outcome-chip--${position.outcome}`}>
                      {position.outcome}
                    </span>
                    <strong>
                      {formatUnits(BigInt(position.balance), position.collateralDecimals)} contracts
                    </strong>
                    <small>
                      {position.claimStatus === "claimable"
                        ? `${formatUnits(BigInt(position.settlementPayout), position.collateralDecimals)} USDso payout`
                        : "No payout value"}
                    </small>
                  </div>
                ))}
              </div>
              <div className="claim-action">
                <div>
                  <span>Expected payout</span>
                  <strong>{formatUnits(payout, first.collateralDecimals)} USDso</strong>
                  <small>Gas is paid in STT and estimated by your wallet.</small>
                </div>
                {stage === "claimed" && receipts[first.marketId] ? (
                  <a
                    href={`https://shannon-explorer.somnia.network/tx/${receipts[first.marketId]}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View claim transaction ↗
                  </a>
                ) : (
                  <Button loading={pending} disabled={claimable.length === 0} onClick={() => redeem(group)}>
                    {stageLabel(stage)}
                  </Button>
                )}
              </div>
              <OracleEvidencePanel
                marketId={first.marketId}
                resolution={first.resolution}
                evidence={first.oracleEvidence}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}

function groupByMarket(positions: readonly PortfolioPosition[]) {
  const groups = new Map<string, PortfolioPosition[]>();
  for (const position of positions)
    groups.set(position.marketId, [...(groups.get(position.marketId) ?? []), position]);
  return [...groups.values()].sort(
    (left, right) => Date.parse(right[0]!.expiresAt) - Date.parse(left[0]!.expiresAt),
  );
}

function assertPlan(plan: RedemptionPlan, account: Address, chainId: number) {
  if (plan.account.toLowerCase() !== account.toLowerCase())
    throw new Error("Plan wallet does not match the connected wallet.");
  if (plan.chainId !== chainId) throw new Error("Plan network does not match the connected network.");
  if (Date.parse(plan.expiresAt) <= Date.now()) throw new Error("Redemption plan expired; refresh it.");
}

function stageLabel(stage: ClaimStage) {
  if (stage === "error") return "Retry claim";
  if (stage === "approving") return "Approving outcome token…";
  if (stage === "redeeming") return "Open wallet…";
  if (stage === "confirming") return "Confirming…";
  if (stage === "preparing") return "Rechecking contract…";
  return "Redeem to wallet";
}
