import { orderBookEventsAbi } from "@somnia-chain/markets-sdk";
import {
  DataStreamEventSchema,
  NormalizedFillSchema,
  TradeExecutionSchema,
  type DataStreamEvent,
  type NormalizedFill,
  type TradeExecution,
  type TradePlan,
} from "@eventrail/types";
import { decodeEventLog, type Address, type Hex } from "viem";

export const workerName = "receipts";
export type ReceiptState =
  "submitted" | "confirmed" | "filled" | "partially_filled" | "unfilled" | "reverted";

export interface SubmittedTrade {
  plan: TradePlan;
  transactionHash: Hex;
}

export interface ChainReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  logs: readonly {
    address: Address;
    data: Hex;
    topics: readonly Hex[];
    logIndex: number;
  }[];
}

export interface ReceiptReader {
  getReceipt(hash: Hex): Promise<ChainReceipt | null>;
}

export interface TradeExecutionRepository {
  save(execution: TradeExecution, fills: readonly NormalizedFill[]): Promise<void>;
}

export interface TradeEventPublisher {
  publish(event: DataStreamEvent): Promise<unknown>;
}

export class TradeReceiptReconciler {
  constructor(
    private readonly reader: ReceiptReader,
    private readonly repository: TradeExecutionRepository,
    private readonly publisher?: TradeEventPublisher,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async reconcile(submission: SubmittedTrade): Promise<TradeExecution> {
    const receipt = await this.reader.getReceipt(submission.transactionHash);
    const observedAt = this.clock().toISOString();
    if (!receipt) {
      return this.#persist(submission, "submitted", null, [], null, observedAt);
    }
    if (receipt.status === "reverted") {
      return this.#persist(
        submission,
        "reverted",
        receipt.blockNumber,
        [],
        "TRANSACTION_REVERTED",
        observedAt,
      );
    }
    const fills = decodeFills(submission, receipt, observedAt);
    const filled = fills.reduce((sum, fill) => sum + BigInt(fill.quantity), 0n);
    const requested = BigInt(submission.plan.quantity);
    const state = filled === 0n ? "unfilled" : filled < requested ? "partially_filled" : "filled";
    return this.#persist(submission, state, receipt.blockNumber, fills, null, observedAt);
  }

  async #persist(
    submission: SubmittedTrade,
    state: ReceiptState,
    blockNumber: bigint | null,
    fills: readonly NormalizedFill[],
    errorCode: string | null,
    observedAt: string,
  ): Promise<TradeExecution> {
    const filled = fills.reduce((sum, fill) => sum + BigInt(fill.quantity), 0n);
    const realizedQuote = fills.reduce((sum, fill) => sum + BigInt(fill.quoteQuantity), 0n);
    const one = 10n ** BigInt(submission.plan.quote.collateralDecimals);
    const average = filled === 0n ? null : ((realizedQuote * one) / filled).toString();
    const execution = TradeExecutionSchema.parse({
      planId: submission.plan.planId,
      planHash: submission.plan.planHash,
      network: submission.plan.network,
      account: submission.plan.account,
      marketId: submission.plan.marketId,
      poolAddress: submission.plan.poolAddress,
      transactionHash: submission.transactionHash,
      state,
      requestedQuantity: submission.plan.quantity,
      filledQuantity: filled.toString(),
      realizedQuoteQuantity: realizedQuote.toString(),
      realizedAveragePrice: average,
      blockNumber: blockNumber?.toString() ?? null,
      errorCode,
      observedAt,
    });
    await this.repository.save(execution, fills);
    if (this.publisher && blockNumber !== null) {
      await this.publisher.publish(eventFor(execution, blockNumber));
      if (filled > 0n) await this.publisher.publish(positionEventFor(execution, blockNumber));
    }
    return execution;
  }
}

function decodeFills(
  submission: SubmittedTrade,
  receipt: ChainReceipt,
  observedAt: string,
): NormalizedFill[] {
  const fills: NormalizedFill[] = [];
  const one = 10n ** BigInt(submission.plan.quote.collateralDecimals);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== submission.plan.poolAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: orderBookEventsAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      if (decoded.eventName !== "OrderFilled") continue;
      const quantity = decoded.args.quantityFilled;
      const yesPrice = decoded.args.fillPrice;
      const price = submission.plan.outcome === "up" ? yesPrice : one - yesPrice;
      fills.push(
        NormalizedFillSchema.parse({
          network: submission.plan.network,
          venue: "dreamdex",
          marketId: submission.plan.marketId,
          poolAddress: submission.plan.poolAddress,
          transactionHash: submission.transactionHash,
          logIndex: log.logIndex.toString(),
          blockNumber: receipt.blockNumber.toString(),
          timestamp: observedAt,
          outcome: submission.plan.outcome,
          side: submission.plan.side,
          price: price.toString(),
          quantity: quantity.toString(),
          quoteQuantity: ((quantity * price) / one).toString(),
          maker: null,
          taker: submission.plan.account,
        }),
      );
    } catch {
      // A receipt contains approval and unrelated pool logs; only the canonical fill event is material here.
    }
  }
  return fills;
}

function eventFor(execution: TradeExecution, blockNumber: bigint): DataStreamEvent {
  return DataStreamEventSchema.parse({
    version: "1",
    type: "transaction.updated",
    eventId: `transaction:${execution.network}:${execution.transactionHash}`,
    sequence: "0",
    network: execution.network,
    venue: "dreamdex",
    marketId: execution.marketId,
    sourceBlock: blockNumber.toString(),
    logIndex: null,
    observedAt: execution.observedAt,
    payload: execution,
  });
}

function positionEventFor(execution: TradeExecution, blockNumber: bigint): DataStreamEvent {
  return DataStreamEventSchema.parse({
    version: "1",
    type: "position.updated",
    eventId: `position:${execution.network}:${execution.transactionHash}`,
    sequence: "1",
    network: execution.network,
    venue: "dreamdex",
    marketId: execution.marketId,
    sourceBlock: blockNumber.toString(),
    logIndex: null,
    observedAt: execution.observedAt,
    payload: {
      account: execution.account,
      outcome: execution.state,
      filledQuantity: execution.filledQuantity,
      transactionHash: execution.transactionHash,
    },
  });
}
