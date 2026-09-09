import { binaryModuleWriteAbi, erc6909Abi } from "@somnia-chain/markets-sdk";
import { RedemptionPlanSchema, type PortfolioPosition, type RedemptionPlan } from "@eventrail/types";
import { encodeFunctionData, keccak256, stringToHex, type Address, type Hex } from "viem";

const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;
const APPROVAL_GAS = 1_000_000n;
const REDEMPTION_GAS = 10_000_000n;

export interface CreateRedemptionPlanInput {
  account: Address;
  chainId: number;
  moduleAddress: Address;
  positions: readonly PortfolioPosition[];
  clock?: () => Date;
  planId?: () => string;
}

export class RedemptionPlanError extends Error {
  constructor(
    readonly code: "NOT_TERMINAL" | "NOT_CLAIMABLE" | "MIXED_MARKET" | "INVALID_WINNER",
    message: string,
  ) {
    super(message);
    this.name = "RedemptionPlanError";
  }
}

export function createRedemptionPlan(input: CreateRedemptionPlanInput): RedemptionPlan {
  const positions = input.positions.filter((position) => BigInt(position.balance) > 0n);
  const first = positions[0];
  if (!first) throw new RedemptionPlanError("NOT_CLAIMABLE", "No non-zero outcome balance is redeemable.");
  if (
    positions.some(
      (position) =>
        position.marketId.toLowerCase() !== first.marketId.toLowerCase() ||
        position.account.toLowerCase() !== input.account.toLowerCase() ||
        position.outcomeTokenAddress.toLowerCase() !== first.outcomeTokenAddress.toLowerCase(),
    )
  ) {
    throw new RedemptionPlanError("MIXED_MARKET", "A redemption plan is scoped to one wallet and market.");
  }
  if (first.resolution.state === "unresolved") {
    throw new RedemptionPlanError("NOT_TERMINAL", "The DreamDEX event contract is not settled yet.");
  }
  const claimable = positions.filter((position) => position.claimStatus === "claimable");
  if (first.resolution.state === "resolved") {
    if (!first.resolution.winningOutcome) {
      throw new RedemptionPlanError("INVALID_WINNER", "The settled contract has no winning outcome.");
    }
    const loserHeld = claimable.some((position) => position.outcome !== first.resolution.winningOutcome);
    if (loserHeld) throw new RedemptionPlanError("INVALID_WINNER", "A losing outcome cannot be redeemed.");
  }
  if (claimable.length === 0) {
    throw new RedemptionPlanError("NOT_CLAIMABLE", "This wallet has no payout-bearing balance.");
  }

  const entries = claimable
    .sort((left, right) => left.outcome.localeCompare(right.outcome))
    .map((position) => ({
      outcome: position.outcome,
      outcomeIndex: position.outcome === "up" ? (0 as const) : (1 as const),
      tokenId: position.tokenId,
      amount: position.balance,
      expectedPayout: position.settlementPayout,
    }));
  const createdAt = (input.clock ?? (() => new Date()))();
  const expiresAt = new Date(createdAt.getTime() + 30_000);
  const calls = [
    {
      kind: "approval" as const,
      to: first.outcomeTokenAddress,
      data: encodeFunctionData({
        abi: erc6909Abi,
        functionName: "setOperator",
        args: [input.moduleAddress, true],
      }),
      value: "0",
      gas: APPROVAL_GAS.toString(),
      description: "Allow the DreamDEX module to transfer outcome tokens for redemption",
      requiresConfirmation: true,
    },
    {
      kind: "redemption" as const,
      to: input.moduleAddress,
      data: encodeFunctionData({
        abi: binaryModuleWriteAbi,
        functionName: "redeemMany",
        args: [
          0,
          ZERO_BYTES32,
          entries.map(() => first.marketId as Hex),
          entries.map((entry) => entry.outcomeIndex),
          entries.map((entry) => BigInt(entry.amount)),
        ],
      }),
      value: "0",
      gas: REDEMPTION_GAS.toString(),
      description:
        first.resolution.state === "voided"
          ? "Redeem eligible UP and DOWN balances at the contract's void payout"
          : `Redeem the winning ${first.resolution.winningOutcome?.toUpperCase()} balance`,
      requiresConfirmation: true,
    },
  ];
  const unsigned = {
    version: "1" as const,
    network: first.network,
    chainId: input.chainId,
    account: input.account.toLowerCase() as Address,
    marketId: first.marketId,
    outcomeTokenAddress: first.outcomeTokenAddress,
    moduleAddress: input.moduleAddress,
    resolution: {
      state: first.resolution.state,
      winningOutcome: first.resolution.winningOutcome,
      payoutUp: first.resolution.payoutUp,
      payoutDown: first.resolution.payoutDown,
      payoutDenominator: first.resolution.payoutDenominator,
    },
    entries,
    calls,
    sourceBlock: first.freshness.sourceBlock,
    summary: `Redeem ${entries.length} settled ${entries.length === 1 ? "position" : "positions"} from DreamDEX`,
    assumptions: [
      "Balances and payout vectors are re-read before this short-lived plan is returned.",
      "The wallet remains the transaction sender and receives the contract payout directly.",
    ],
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  return RedemptionPlanSchema.parse({
    ...unsigned,
    planId: (input.planId ?? (() => globalThis.crypto.randomUUID()))(),
    planHash: hashCanonical(unsigned),
  });
}

export type HashableRedemptionPlan = Omit<RedemptionPlan, "planId" | "planHash">;

export function computeRedemptionPlanHash(plan: HashableRedemptionPlan): Hex {
  return hashCanonical(plan);
}

function hashCanonical(value: unknown): Hex {
  return keccak256(stringToHex(stableStringify(value)));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
