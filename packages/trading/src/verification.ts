import {
  NormalizedMarketSchema,
  PlanVerificationSchema,
  TradePlanSchema,
  type NormalizedMarket,
  type PlannedCall,
  type PlanVerification,
  type TradePlan,
} from "@eventrail/types";
import type { Address, Hex } from "viem";
import { computeTradePlanHash, type HashableTradePlan } from "./plan.js";

export type PlanVerificationErrorCode =
  | "ACCOUNT_MISMATCH"
  | "CHAIN_MISMATCH"
  | "MARKET_LOCKED"
  | "MARKET_ROLLED_OVER"
  | "MARKET_TOO_CLOSE_TO_EXPIRY"
  | "PLAN_EXPIRED"
  | "PLAN_TAMPERED"
  | "SIMULATION_FAILED"
  | "SOURCE_BLOCK_TOO_OLD";

export class PlanVerificationError extends Error {
  constructor(
    readonly code: PlanVerificationErrorCode,
    readonly userMessage: string,
    options?: ErrorOptions,
  ) {
    super(userMessage, options);
    this.name = "PlanVerificationError";
  }
}

export interface ExactCallSimulation {
  success: boolean;
  estimatedGas?: bigint;
  error?: unknown;
}

export interface PlanVerificationReader {
  getMarket(marketId: string): Promise<NormalizedMarket | null>;
  getBlockNumber(): Promise<bigint>;
  simulate(call: {
    account: Address;
    to: Address;
    data: Hex;
    value: bigint;
    gas: bigint;
  }): Promise<ExactCallSimulation>;
}

export interface VerifyTradePlanOptions {
  expectedChainId: number;
  account: Address;
  reader: PlanVerificationReader;
  now?: Date;
  maxSourceBlockLag?: bigint;
}

export async function verifyTradePlan(
  planInput: TradePlan,
  options: VerifyTradePlanOptions,
): Promise<PlanVerification> {
  const plan = TradePlanSchema.parse(planInput);
  const now = options.now ?? new Date();
  const hashable = Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== "planId" && key !== "planHash"),
  ) as HashableTradePlan;
  if (computeTradePlanHash(hashable).toLowerCase() !== plan.planHash.toLowerCase()) {
    reject("PLAN_TAMPERED", "Trade details changed after planning. Request a new quote.");
  }
  if (plan.chainId !== options.expectedChainId) {
    reject("CHAIN_MISMATCH", "Switch your wallet to the network shown in this trade plan.");
  }
  if (plan.account.toLowerCase() !== options.account.toLowerCase()) {
    reject("ACCOUNT_MISMATCH", "This trade plan belongs to a different wallet account.");
  }
  if (Date.parse(plan.expiresAt) <= now.getTime()) {
    reject("PLAN_EXPIRED", "This trade plan expired. Refresh the quote before signing.");
  }

  const [marketInput, sourceBlock] = await Promise.all([
    options.reader.getMarket(plan.marketId),
    options.reader.getBlockNumber(),
  ]);
  if (!marketInput) {
    reject("MARKET_ROLLED_OVER", "This market generation is unavailable. Open its current successor.");
  }
  const market = NormalizedMarketSchema.parse(marketInput);
  if (
    market.marketId.toLowerCase() !== plan.marketId.toLowerCase() ||
    market.poolAddress.toLowerCase() !== plan.poolAddress.toLowerCase()
  ) {
    reject("MARKET_ROLLED_OVER", "DreamDEX now binds this pool to another market. Request a new plan.");
  }
  if (market.status !== "trading") {
    reject("MARKET_LOCKED", "This market has locked and can no longer accept orders.");
  }
  if (Date.parse(market.expiresAt) - now.getTime() < plan.policy.minimumTimeRemainingSeconds * 1_000) {
    reject("MARKET_TOO_CLOSE_TO_EXPIRY", "This market is too close to lock. Open its successor.");
  }
  const quoteBlock = BigInt(plan.quote.sourceBlock);
  if (sourceBlock < quoteBlock) {
    reject("SOURCE_BLOCK_TOO_OLD", "RPC state is behind this quote. Refresh before signing.");
  }
  if (
    options.maxSourceBlockLag !== undefined &&
    sourceBlock > quoteBlock &&
    sourceBlock - quoteBlock > options.maxSourceBlockLag
  ) {
    reject("SOURCE_BLOCK_TOO_OLD", "Chain state moved beyond this quote. Refresh before signing.");
  }

  const simulations = [];
  for (const [callIndex, call] of plan.calls.entries()) {
    assertCallDestination(plan, call, callIndex);
    const result = await options.reader.simulate({
      account: plan.account as Address,
      to: call.to as Address,
      data: call.data as Hex,
      value: BigInt(call.value),
      gas: BigInt(call.gas),
    });
    if (!result.success) {
      throw new PlanVerificationError(
        "SIMULATION_FAILED",
        `${call.description} could not be simulated. No wallet request was opened.`,
        result.error === undefined ? undefined : { cause: result.error },
      );
    }
    simulations.push({
      callIndex,
      kind: call.kind,
      gasLimit: call.gas,
      estimatedGas: result.estimatedGas?.toString() ?? null,
    });
  }

  return PlanVerificationSchema.parse({
    ok: true,
    planId: plan.planId,
    planHash: plan.planHash,
    checkedAt: now.toISOString(),
    sourceBlock: sourceBlock.toString(),
    simulations,
  });
}

function assertCallDestination(plan: TradePlan, call: PlannedCall, index: number): void {
  const expected =
    call.kind === "order"
      ? plan.poolAddress
      : plan.side === "buy"
        ? plan.collateralAddress
        : plan.outcomeTokenAddress;
  if (
    call.to.toLowerCase() !== expected.toLowerCase() ||
    (call.kind === "order" && index !== plan.calls.length - 1)
  ) {
    reject("PLAN_TAMPERED", "A transaction destination or call order changed after planning.");
  }
}

function reject(code: PlanVerificationErrorCode, message: string): never {
  throw new PlanVerificationError(code, message);
}
