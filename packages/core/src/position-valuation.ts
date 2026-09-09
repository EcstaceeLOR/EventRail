import {
  PortfolioSummarySchema,
  type MarketResolution,
  type PortfolioPosition,
  type PortfolioSummary,
} from "@eventrail/types";

export interface PositionValuationInput {
  balance: bigint;
  indexedBalance: bigint;
  indexedCostBasis: bigint;
  indexedAverageEntryPrice: bigint | null;
  indexedMarkPrice: bigint | null;
  indexedRealizedPnl: bigint;
  resolution: MarketResolution;
  outcome: "up" | "down";
  collateralDecimals: number;
  redeemedQuantity?: bigint;
  redemptionPayout?: bigint;
}

export interface PositionValuation {
  costBasis: bigint;
  averageEntryPrice: bigint | null;
  markPrice: bigint | null;
  markValue: bigint | null;
  realizedPnl: bigint;
  unrealizedPnl: bigint | null;
  settlementPayout: bigint;
  claimStatus: "pending" | "claimable" | "claimed" | "no_value";
  assumptions: readonly string[];
}

export function calculatePositionValuation(input: PositionValuationInput): PositionValuation {
  const one = 10n ** BigInt(input.collateralDecimals);
  const average =
    input.indexedAverageEntryPrice ??
    (input.indexedBalance > 0n ? (input.indexedCostBasis * one) / input.indexedBalance : null);
  const costBasis = average === null ? 0n : (input.balance * average) / one;
  const payoutPrice = settlementPrice(input.resolution, input.outcome, one);
  const markPrice = payoutPrice ?? input.indexedMarkPrice;
  const markValue = markPrice === null ? null : (input.balance * markPrice) / one;
  const settlementPayout = payoutPrice === null ? 0n : (input.balance * payoutPrice) / one;
  const redeemedQuantity = input.redeemedQuantity ?? 0n;
  const redemptionPayout = input.redemptionPayout ?? 0n;
  const redeemedCostBasis = average === null ? null : (redeemedQuantity * average) / one;
  const realizedPnl =
    input.indexedRealizedPnl + (redeemedCostBasis === null ? 0n : redemptionPayout - redeemedCostBasis);
  const terminal = input.resolution.state !== "unresolved";
  const claimStatus =
    input.balance === 0n && redeemedQuantity > 0n
      ? "claimed"
      : terminal && input.balance > 0n && settlementPayout > 0n
        ? "claimable"
        : terminal && input.balance > 0n
          ? "no_value"
          : "pending";
  const assumptions = [
    "Cost basis uses indexed average-cost fills and is scaled to the authoritative ERC-6909 balance.",
    payoutPrice === null
      ? "Open positions use the executable DreamDEX mark; missing depth remains unknown."
      : "Terminal positions use the contract payout vector rather than a secondary-market price.",
    redeemedQuantity > 0n && redeemedCostBasis === null
      ? "Redemption payout is retained, but realized P&L stays unknown without historical entry basis."
      : "Realized redemption P&L subtracts the indexed average-cost basis of redeemed contracts.",
  ];
  return {
    costBasis,
    averageEntryPrice: input.balance > 0n ? average : null,
    markPrice,
    markValue,
    realizedPnl,
    unrealizedPnl: markValue === null ? null : markValue - costBasis,
    settlementPayout,
    claimStatus,
    assumptions,
  };
}

export function summarizePortfolio(positions: readonly PortfolioPosition[]): PortfolioSummary {
  const decimals = new Set(positions.map((position) => position.collateralDecimals));
  const knownMarks = positions.every((position) => position.markValue !== null);
  const totalCostBasis = sum(positions, "costBasis");
  const totalMarkValue = knownMarks ? sum(positions, "markValue") : null;
  const totalRealizedPnl = sumSigned(positions, "realizedPnl");
  const totalUnrealizedPnl = knownMarks ? sumSigned(positions, "unrealizedPnl") : null;
  return PortfolioSummarySchema.parse({
    account: positions[0]?.account ?? "0x0000000000000000000000000000000000000000",
    collateralDecimals: decimals.size === 1 ? [...decimals][0] : null,
    totalCostBasis: totalCostBasis.toString(),
    totalMarkValue: totalMarkValue?.toString() ?? null,
    totalRealizedPnl: totalRealizedPnl.toString(),
    totalUnrealizedPnl: totalUnrealizedPnl?.toString() ?? null,
    claimablePayout: positions
      .filter((position) => position.claimStatus === "claimable")
      .reduce((total, position) => total + BigInt(position.settlementPayout), 0n)
      .toString(),
    openPositionCount: positions.filter((position) => position.status === "trading").length.toString(),
    lockedPositionCount: positions
      .filter((position) => position.status === "locked" || position.status === "settling")
      .length.toString(),
  });
}

function settlementPrice(resolution: MarketResolution, outcome: "up" | "down", one: bigint) {
  const numerator = outcome === "up" ? resolution.payoutUp : resolution.payoutDown;
  if (
    numerator !== null &&
    resolution.payoutDenominator !== null &&
    BigInt(resolution.payoutDenominator) > 0n
  ) {
    return (BigInt(numerator) * one) / BigInt(resolution.payoutDenominator);
  }
  if (resolution.state === "voided") return one / 2n;
  if (resolution.state === "resolved") return resolution.winningOutcome === outcome ? one : 0n;
  return null;
}

function sum(positions: readonly PortfolioPosition[], key: "costBasis" | "markValue"): bigint {
  return positions.reduce((total, position) => total + BigInt(position[key] ?? "0"), 0n);
}

function sumSigned(positions: readonly PortfolioPosition[], key: "realizedPnl" | "unrealizedPnl"): bigint {
  return positions.reduce((total, position) => total + BigInt(position[key] ?? "0"), 0n);
}
