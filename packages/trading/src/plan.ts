import {
  ORDER_KIND,
  ORDER_TYPE,
  binaryPoolWriteAbi,
  erc20WriteAbi,
  erc6909Abi,
} from "@somnia-chain/markets-sdk";
import { TradePlanSchema, type PlanPolicy, type TradePlan, type TradeQuote } from "@eventrail/types";
import { resolveBuilderAttribution, type BuilderCapability } from "@eventrail/platform";
import { encodeFunctionData, keccak256, stringToHex, type Address, type Hex } from "viem";

const DEFAULT_ORDER_GAS = 10_000_000n;
const DEFAULT_APPROVAL_GAS = 1_000_000n;

export interface CreateTradePlanInput {
  idempotencyKey: string;
  chainId: number;
  account: Address;
  collateralAddress: Address;
  outcomeTokenAddress: Address;
  upTokenId: string;
  downTokenId: string;
  quote: TradeQuote;
  policy: PlanPolicy;
  builder?: {
    requested: boolean;
    address?: Address;
    feeBpsTimes1k?: bigint;
    capability?: BuilderCapability | null;
  };
}

export interface StoredTradePlan {
  requestHash: Hex;
  plan: TradePlan;
}

export interface TradePlanStore {
  find(network: string, account: string, idempotencyKey: string): Promise<StoredTradePlan | null>;
  putIfAbsent(
    network: string,
    account: string,
    idempotencyKey: string,
    record: StoredTradePlan,
  ): Promise<StoredTradePlan>;
}

export class PlanConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("This idempotency key was already used for a different trade intent.");
    this.name = "PlanConflictError";
  }
}

export class InMemoryTradePlanStore implements TradePlanStore {
  readonly #records = new Map<string, StoredTradePlan>();

  async find(network: string, account: string, idempotencyKey: string): Promise<StoredTradePlan | null> {
    return this.#records.get(storeKey(network, account, idempotencyKey)) ?? null;
  }

  async putIfAbsent(
    network: string,
    account: string,
    idempotencyKey: string,
    record: StoredTradePlan,
  ): Promise<StoredTradePlan> {
    const key = storeKey(network, account, idempotencyKey);
    const existing = this.#records.get(key);
    if (existing) return existing;
    this.#records.set(key, record);
    return record;
  }
}

export interface TradePlannerOptions {
  store: TradePlanStore;
  clock?: () => Date;
  planId?: () => string;
}

export class TradePlanner {
  readonly #store: TradePlanStore;
  readonly #clock: () => Date;
  readonly #planId: () => string;

  constructor(options: TradePlannerOptions) {
    this.#store = options.store;
    this.#clock = options.clock ?? (() => new Date());
    this.#planId = options.planId ?? (() => globalThis.crypto.randomUUID());
  }

  async create(input: CreateTradePlanInput): Promise<TradePlan> {
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
      throw new RangeError("idempotencyKey must contain 8 to 128 characters.");
    }
    if (
      input.quote.sourceBlock !== input.policy.quoteSourceBlock ||
      input.quote.expiresAt !== input.policy.quoteExpiresAt
    ) {
      throw new TypeError("Plan policy must preserve the quote source block and expiry.");
    }
    const requestHash = hashCanonical(planRequestPayload(input));
    const existing = await this.#store.find(input.quote.network, input.account, input.idempotencyKey);
    if (existing) return matching(existing, requestHash);

    const createdAt = this.#clock();
    if (Date.parse(input.quote.expiresAt) <= createdAt.getTime()) {
      throw new RangeError("The executable quote has expired.");
    }
    const planId = this.#planId();
    const one = 10n ** BigInt(input.quote.collateralDecimals);
    const yesTermsPrice =
      input.quote.outcome === "up" ? BigInt(input.quote.limitPrice) : one - BigInt(input.quote.limitPrice);
    const side = sdkSide(input.quote.outcome, input.quote.side);
    const orderExpiryNs = BigInt(Date.parse(input.quote.expiresAt)) * 1_000_000n;
    const attribution = resolveBuilderAttribution({
      requested: input.builder?.requested ?? false,
      ...(input.builder?.address ? { builder: input.builder.address } : {}),
      ...(input.builder?.feeBpsTimes1k === undefined ? {} : { feeBpsTimes1k: input.builder.feeBpsTimes1k }),
      ...(input.builder?.capability === undefined ? {} : { capability: input.builder.capability }),
    });
    const calls = buildCalls(input, side, yesTermsPrice, orderExpiryNs, attribution);
    const unsigned = {
      version: "1" as const,
      network: input.quote.network,
      chainId: input.chainId,
      account: input.account.toLowerCase() as Address,
      marketId: input.quote.marketId,
      poolAddress: input.quote.poolAddress,
      collateralAddress: input.collateralAddress,
      outcomeTokenAddress: input.outcomeTokenAddress,
      outcome: input.quote.outcome,
      side: input.quote.side,
      yesTermsPrice: yesTermsPrice.toString(),
      quantity: input.quote.quantity,
      orderType: "ioc" as const,
      orderExpiryNs: orderExpiryNs.toString(),
      quote: input.quote,
      policy: input.policy,
      builderAttribution: { ...attribution, feeBpsTimes1k: attribution.feeBpsTimes1k.toString() },
      calls,
      summary: `${input.quote.side === "buy" ? "Buy" : "Sell"} ${input.quote.outcome.toUpperCase()} through DreamDEX IOC`,
      createdAt: createdAt.toISOString(),
      expiresAt: input.quote.expiresAt,
    };
    const planHash = computeTradePlanHash(unsigned);
    const plan = TradePlanSchema.parse({ ...unsigned, planId, planHash });
    const stored = await this.#store.putIfAbsent(input.quote.network, input.account, input.idempotencyKey, {
      requestHash,
      plan,
    });
    return matching(stored, requestHash);
  }
}

export type HashableTradePlan = Omit<TradePlan, "planId" | "planHash">;

export function computeTradePlanHash(plan: HashableTradePlan): Hex {
  return hashCanonical({
    version: plan.version,
    network: plan.network,
    chainId: plan.chainId,
    account: plan.account.toLowerCase(),
    marketId: plan.marketId.toLowerCase(),
    poolAddress: plan.poolAddress.toLowerCase(),
    collateralAddress: plan.collateralAddress.toLowerCase(),
    outcomeTokenAddress: plan.outcomeTokenAddress.toLowerCase(),
    outcome: plan.outcome,
    side: plan.side,
    yesTermsPrice: plan.yesTermsPrice,
    quantity: plan.quantity,
    orderType: plan.orderType,
    orderExpiryNs: plan.orderExpiryNs,
    quote: plan.quote,
    policy: plan.policy,
    builderAttribution: plan.builderAttribution,
    calls: plan.calls,
    summary: plan.summary,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
  });
}

export function createBuilderApprovalCall(pool: Address, builder: Address, maxFeeBpsTimes1k: bigint) {
  if (maxFeeBpsTimes1k <= 0n) throw new RangeError("Builder approval must be greater than zero.");
  return {
    kind: "builder_approval" as const,
    to: pool,
    data: encodeFunctionData({
      abi: binaryPoolWriteAbi,
      functionName: "approveBuilder",
      args: [builder, maxFeeBpsTimes1k],
    }),
    value: "0",
    gas: DEFAULT_APPROVAL_GAS.toString(),
    description: `Approve this builder for at most ${maxFeeBpsTimes1k} bps-times-1k per order`,
    requiresConfirmation: true,
  };
}

function buildCalls(
  input: CreateTradePlanInput,
  side: keyof typeof ORDER_KIND,
  yesTermsPrice: bigint,
  orderExpiryNs: bigint,
  attribution: ReturnType<typeof resolveBuilderAttribution>,
) {
  const calls = [];
  if (input.quote.side === "buy") {
    calls.push({
      kind: "approval" as const,
      to: input.collateralAddress,
      data: encodeFunctionData({
        abi: erc20WriteAbi,
        functionName: "approve",
        args: [input.quote.poolAddress as Address, BigInt(input.quote.maximumCost)],
      }),
      value: "0",
      gas: DEFAULT_APPROVAL_GAS.toString(),
      description: `Approve exactly ${input.quote.maximumCost} USDso for this DreamDEX pool`,
      requiresConfirmation: true,
    });
  } else {
    calls.push({
      kind: "approval" as const,
      to: input.outcomeTokenAddress,
      data: encodeFunctionData({
        abi: erc6909Abi,
        functionName: "setOperator",
        args: [input.quote.poolAddress as Address, true],
      }),
      value: "0",
      gas: DEFAULT_APPROVAL_GAS.toString(),
      description: "Allow this DreamDEX pool to transfer outcome tokens",
      requiresConfirmation: true,
    });
  }
  calls.push({
    kind: "order" as const,
    to: input.quote.poolAddress,
    data: encodeFunctionData({
      abi: binaryPoolWriteAbi,
      functionName: "placeBinaryOrder",
      args: [
        ORDER_KIND[side],
        yesTermsPrice,
        BigInt(input.quote.quantity),
        orderExpiryNs,
        ORDER_TYPE.MARKET,
        0,
        attribution.builder,
        attribution.feeBpsTimes1k,
        0n,
      ],
    }),
    value: "0",
    gas: DEFAULT_ORDER_GAS.toString(),
    description: `Submit ${side} as an immediate-or-cancel order`,
    requiresConfirmation: true,
  });
  return calls;
}

function sdkSide(outcome: "up" | "down", side: "buy" | "sell"): keyof typeof ORDER_KIND {
  const sdkOutcome = outcome === "up" ? "YES" : "NO";
  return `${side}_${sdkOutcome}`.toUpperCase() as keyof typeof ORDER_KIND;
}

function planRequestPayload(input: CreateTradePlanInput) {
  return {
    chainId: input.chainId,
    account: input.account.toLowerCase(),
    collateralAddress: input.collateralAddress.toLowerCase(),
    outcomeTokenAddress: input.outcomeTokenAddress.toLowerCase(),
    upTokenId: input.upTokenId,
    downTokenId: input.downTokenId,
    quote: input.quote,
    policy: input.policy,
    builder: input.builder
      ? {
          requested: input.builder.requested,
          address: input.builder.address?.toLowerCase(),
          feeBpsTimes1k: input.builder.feeBpsTimes1k?.toString(),
          capability: input.builder.capability
            ? {
                poolCapBpsTimes1k: input.builder.capability.poolCapBpsTimes1k.toString(),
                userApprovalBpsTimes1k: input.builder.capability.userApprovalBpsTimes1k.toString(),
              }
            : null,
        }
      : null,
  };
}

function matching(record: StoredTradePlan, requestHash: Hex): TradePlan {
  if (record.requestHash !== requestHash) throw new PlanConflictError();
  return record.plan;
}

function storeKey(network: string, account: string, idempotencyKey: string): string {
  return `${network}:${account.toLowerCase()}:${idempotencyKey}`;
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
