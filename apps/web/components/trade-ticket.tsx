"use client";

import { Dialog, StatusBadge, useEventRailClient, useToast } from "@eventrail/react";
import { computeTradePlanHash, verifyTradePlan, type HashableTradePlan } from "@eventrail/trading";
import type { NormalizedMarket, TradePlan, TradeQuote } from "@eventrail/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { usePublicClient, useSendTransaction } from "wagmi";
import { getWalletAction } from "../lib/wallet-state";
import { useWallet } from "./wallet-provider";

type TradeStage =
  | "editing"
  | "quoting"
  | "review"
  | "approving"
  | "simulating"
  | "signing"
  | "confirming"
  | "reconciling"
  | "filled"
  | "partial"
  | "unfilled"
  | "error";

interface TradeTicketProps {
  yesPrice: number;
  noPrice: number;
  market?: NormalizedMarket;
}

const POLICY = {
  maxSlippageBps: 100,
  minimumFillBps: 10_000,
  minimumTimeRemainingSeconds: 30,
} as const;

export function TradeTicket({ yesPrice, noPrice, market }: Readonly<TradeTicketProps>) {
  const wallet = useWallet();
  const walletAction = getWalletAction(wallet.connected, wallet.correctNetwork);
  const client = useEventRailClient();
  const publicClient = usePublicClient();
  const transaction = useSendTransaction();
  const toast = useToast();
  const [outcome, setOutcome] = useState<"up" | "down">("up");
  const [mode, setMode] = useState<"spend" | "quantity">("spend");
  const [amount, setAmount] = useState("25");
  const [stage, setStage] = useState<TradeStage>("editing");
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [plan, setPlan] = useState<TradePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [execution, setExecution] = useState<{ hash: Hex; filled: bigint } | null>(null);
  const displayPrice = outcome === "up" ? yesPrice : noPrice;
  const numericAmount = Number(amount) || 0;
  const estimatedContracts = useMemo(
    () => (displayPrice > 0 ? numericAmount / displayPrice : 0),
    [displayPrice, numericAmount],
  );

  useEffect(() => {
    if (!quote) return;
    const update = () =>
      setSecondsLeft(Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - Date.now()) / 1_000)));
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [quote]);

  useEffect(() => {
    if (secondsLeft !== 0 || stage !== "review") return;
    setQuote(null);
    setPlan(null);
    setStage("editing");
    setError("Quote expired. Review the refreshed market before continuing.");
  }, [secondsLeft, stage]);

  async function prepareTrade() {
    if (walletAction === "connect") return wallet.openWallet();
    if (walletAction === "switch") return wallet.switchToShannon();
    if (!wallet.address || !market) {
      setError("Live trading activates on a DreamDEX market loaded from the gateway.");
      return;
    }
    try {
      setError(null);
      setStage("quoting");
      const rawAmount = parseUnits(amount || "0", market.collateralDecimals).toString();
      let availableBalance: string | undefined;
      if (publicClient) {
        availableBalance = (
          await publicClient.readContract({
            address: market.collateralAddress as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.address],
          })
        ).toString();
      }
      const nextQuote = await client.createTradeQuote({
        marketId: market.marketId,
        outcome,
        side: "buy",
        mode,
        amount: rawAmount,
        ...(availableBalance === undefined ? {} : { availableBalance }),
        ...POLICY,
      });
      const nextPlan = await client.createTradePlan({
        account: wallet.address,
        idempotencyKey: globalThis.crypto.randomUUID(),
        quote: nextQuote,
        policy: {
          ...POLICY,
          quoteSourceBlock: nextQuote.sourceBlock,
          quoteExpiresAt: nextQuote.expiresAt,
        },
      });
      setQuote(nextQuote);
      setPlan(nextPlan);
      setStage("review");
    } catch (cause) {
      fail(cause, "Unable to prepare an executable quote.");
    }
  }

  async function executeTrade() {
    if (!plan || !quote || !wallet.address || !publicClient) return;
    try {
      setError(null);
      await assertPlanEnvelope(plan, wallet.address, publicClient.chain.id, client.getMarket.bind(client));
      const [approval, order] = plan.calls;
      if (!approval || !order) throw new Error("The trade plan is missing required calls.");

      setStage("approving");
      const needsApproval = await approvalRequired(plan, publicClient);
      if (needsApproval) {
        await publicClient.call(toSimulationCall(plan.account as Address, approval));
        const approvalHash = await transaction.sendTransactionAsync(toWalletCall(approval));
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") throw new Error("USDso approval reverted.");
      }

      setStage("simulating");
      await verifyTradePlan(plan, {
        expectedChainId: publicClient.chain.id,
        account: wallet.address,
        reader: {
          getMarket: (marketId) => client.getMarket(marketId),
          getBlockNumber: () => publicClient.getBlockNumber(),
          simulate: async (call) => {
            try {
              const [, estimatedGas] = await Promise.all([
                publicClient.call(call),
                publicClient.estimateGas(call),
              ]);
              return { success: true, estimatedGas };
            } catch (simulationError) {
              return { success: false, error: simulationError };
            }
          },
        },
      });

      setStage("signing");
      const orderHash = await transaction.sendTransactionAsync(toWalletCall(order));
      try {
        await client.submitTrade({
          planId: plan.planId,
          planHash: plan.planHash,
          account: wallet.address,
          transactionHash: orderHash,
        });
      } catch {
        toast({
          title: "Transaction broadcast",
          message:
            "The chain accepted the order, but durable receipt tracking will retry after confirmation.",
          tone: "warning",
        });
      }
      setStage("confirming");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: orderHash });
      if (receipt.status !== "success") throw new Error("The DreamDEX order reverted on-chain.");
      setStage("reconciling");
      const fills = await reconcileFills(client, plan.marketId, orderHash);
      const filled = fills.reduce((sum, fill) => sum + BigInt(fill.quantity), BigInt(0));
      setExecution({ hash: orderHash, filled });
      setStage(filled === BigInt(0) ? "unfilled" : filled < BigInt(plan.quantity) ? "partial" : "filled");
    } catch (cause) {
      fail(cause, "The wallet-signed trade did not complete.");
    }
  }

  function fail(cause: unknown, fallback: string) {
    const message = cause instanceof Error ? cause.message : fallback;
    setError(message);
    setStage("error");
    toast({ title: "Trade paused safely", message, tone: "error" });
  }

  function reset(next: "up" | "down") {
    setOutcome(next);
    setQuote(null);
    setPlan(null);
    setError(null);
    setStage("editing");
  }

  const pending = !["editing", "review", "filled", "partial", "unfilled", "error"].includes(stage);
  return (
    <aside className="trade-ticket" aria-busy={pending}>
      <div className="ticket-heading">
        <div>
          <span>DreamDEX event contract</span>
          <h2>Take a position</h2>
        </div>
        <span className="safe-pill">Wallet signed</span>
      </div>
      <div className="side-toggle" aria-label="Outcome">
        <button className={outcome === "up" ? "active yes" : ""} type="button" onClick={() => reset("up")}>
          Up <b>{Math.round(yesPrice * 100)}¢</b>
        </button>
        <button className={outcome === "down" ? "active no" : ""} type="button" onClick={() => reset("down")}>
          Down <b>{Math.round(noPrice * 100)}¢</b>
        </button>
      </div>
      <div className="ticket-mode" role="tablist" aria-label="Amount mode">
        <button className={mode === "spend" ? "active" : ""} onClick={() => setMode("spend")} type="button">
          Spend
        </button>
        <button
          className={mode === "quantity" ? "active" : ""}
          onClick={() => setMode("quantity")}
          type="button"
        >
          Contracts
        </button>
      </div>
      <label className="amount-field">
        <span>{mode === "spend" ? "Maximum spend" : "Contract quantity"}</span>
        <div>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="Trade amount"
          />
          <b>{mode === "spend" ? "USDso" : outcome.toUpperCase()}</b>
        </div>
      </label>
      <div className="quick-amounts">
        {[10, 25, 50, 100].map((value) => (
          <button type="button" onClick={() => setAmount(String(value))} key={value}>
            {value}
          </button>
        ))}
      </div>
      <dl className="trade-summary">
        <div>
          <dt>Indicative price</dt>
          <dd>{Math.round(displayPrice * 100)}¢</dd>
        </div>
        <div>
          <dt>Estimated contracts</dt>
          <dd>{estimatedContracts.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>IOC · no resting remainder</dd>
        </div>
        <div className="profit">
          <dt>Potential payout</dt>
          <dd>${estimatedContracts.toFixed(2)}</dd>
        </div>
      </dl>
      {error ? (
        <p className="ticket-error" role="alert">
          {error}
        </p>
      ) : null}
      {error?.toLowerCase().includes("balance") && market ? (
        <Link
          className="secondary-button ticket-funding-link"
          href={`/funding?amount=${encodeURIComponent(amount)}&returnTo=${encodeURIComponent(`/markets/${market.marketId}`)}`}
        >
          Fund USDso through DreamDEX spot
        </Link>
      ) : null}
      <button
        className="primary-button ticket-submit"
        type="button"
        disabled={pending || numericAmount <= 0}
        onClick={prepareTrade}
      >
        {buttonLabel(stage, walletAction)}
      </button>
      <p className="ticket-note">
        EventRail prepares and verifies calls. Your wallet remains the only signer.
      </p>

      <Dialog
        open={stage === "review"}
        onClose={() => setStage("editing")}
        title="Review executable trade"
        description="These limits are hashed into the plan and rechecked immediately before your wallet opens."
      >
        {quote && plan ? (
          <div className="trade-review">
            <div className="review-countdown">
              <StatusBadge tone={secondsLeft <= 3 ? "warning" : "success"}>{secondsLeft}s</StatusBadge>
              <span>quote validity</span>
            </div>
            <dl>
              <div>
                <dt>Outcome</dt>
                <dd>{quote.outcome.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Contracts</dt>
                <dd>{formatUnits(BigInt(quote.quantity), quote.collateralDecimals)}</dd>
              </div>
              <div>
                <dt>Average / worst</dt>
                <dd>
                  {formatProbability(quote.averagePrice, quote.collateralDecimals)} /{" "}
                  {formatProbability(quote.worstPrice, quote.collateralDecimals)}
                </dd>
              </div>
              <div>
                <dt>Maximum cost</dt>
                <dd>{formatUnits(BigInt(quote.maximumCost), quote.collateralDecimals)} USDso</dd>
              </div>
              <div>
                <dt>Minimum fill</dt>
                <dd>{formatUnits(BigInt(quote.minimumFillQuantity), quote.collateralDecimals)}</dd>
              </div>
              <div>
                <dt>Price impact</dt>
                <dd>{(Number(quote.priceImpactBps) / 100).toFixed(2)}%</dd>
              </div>
            </dl>
            <p className="plan-fingerprint">
              Plan {plan.planHash.slice(0, 10)}…{plan.planHash.slice(-8)}
            </p>
            <button className="primary-button ticket-submit" type="button" onClick={executeTrade}>
              Approve and submit IOC
            </button>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={["filled", "partial", "unfilled"].includes(stage)}
        onClose={() => {
          setStage("editing");
          setQuote(null);
          setPlan(null);
        }}
        title={
          stage === "filled"
            ? "Trade filled"
            : stage === "partial"
              ? "Partially filled"
              : "IOC returned unfilled"
        }
        description={
          stage === "unfilled"
            ? "The price moved before execution. No remainder was left on the order book."
            : "The confirmed receipt was reconciled against DreamDEX fills."
        }
      >
        {execution ? (
          <div className="execution-result">
            <strong>{formatUnits(execution.filled, market?.collateralDecimals ?? 6)} contracts</strong>
            <a
              href={`https://shannon-explorer.somnia.network/tx/${execution.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          </div>
        ) : null}
      </Dialog>
    </aside>
  );
}

function toSimulationCall(account: Address, call: TradePlan["calls"][number]) {
  return {
    account,
    to: call.to as Address,
    data: call.data as Hex,
    value: BigInt(call.value),
    gas: BigInt(call.gas),
  };
}

function toWalletCall(call: TradePlan["calls"][number]) {
  return { to: call.to as Address, data: call.data as Hex, value: BigInt(call.value), gas: BigInt(call.gas) };
}

async function approvalRequired(
  plan: TradePlan,
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
) {
  if (plan.side !== "buy") return true;
  const allowance = await publicClient.readContract({
    address: plan.collateralAddress as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [plan.account as Address, plan.poolAddress as Address],
  });
  return allowance < BigInt(plan.quote.maximumCost);
}

async function assertPlanEnvelope(
  plan: TradePlan,
  account: Address,
  chainId: number,
  getMarket: (marketId: string) => Promise<NormalizedMarket>,
) {
  const hashable = Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== "planId" && key !== "planHash"),
  ) as HashableTradePlan;
  if (computeTradePlanHash(hashable) !== plan.planHash) throw new Error("Trade plan changed after review.");
  if (plan.account.toLowerCase() !== account.toLowerCase())
    throw new Error("Trade plan belongs to another wallet.");
  if (plan.chainId !== chainId) throw new Error("Wallet network changed after review.");
  if (Date.parse(plan.expiresAt) <= Date.now()) throw new Error("Trade plan expired before signing.");
  const current = await getMarket(plan.marketId);
  if (current.status !== "trading" || current.poolAddress.toLowerCase() !== plan.poolAddress.toLowerCase()) {
    throw new Error("Market locked or rolled over before signing.");
  }
}

async function reconcileFills(client: ReturnType<typeof useEventRailClient>, marketId: string, hash: Hex) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const fills = await client.getTrades(marketId);
    const matching = fills.filter((fill) => fill.transactionHash.toLowerCase() === hash.toLowerCase());
    if (matching.length > 0) return matching;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return [];
}

function formatProbability(value: string, decimals: number) {
  return `${(Number(formatUnits(BigInt(value), decimals)) * 100).toFixed(1)}¢`;
}

function buttonLabel(stage: TradeStage, walletAction: "connect" | "switch" | "review") {
  if (walletAction === "connect") return "Connect wallet to review";
  if (walletAction === "switch") return "Switch to Shannon";
  const labels: Partial<Record<TradeStage, string>> = {
    quoting: "Walking live depth…",
    approving: "Confirm approval…",
    simulating: "Simulating exact calls…",
    signing: "Confirm IOC order…",
    confirming: "Waiting for confirmation…",
    reconciling: "Reconciling fills…",
  };
  return labels[stage] ?? "Review trade";
}
