import {
  ClaimCandidateSchema,
  type ClaimCandidate,
  type NormalizedMarket,
  type OutcomeBalances,
  type SomniaNetwork,
} from "@eventrail/types";

export interface FinalizedMarketReader {
  listHistoricalMarkets(options: {
    limit: number;
    offset: number;
    signal?: AbortSignal;
  }): Promise<readonly NormalizedMarket[]>;
  getOutcomeBalances(
    account: string,
    marketId: string,
    signal?: AbortSignal,
  ): Promise<OutcomeBalances | null>;
}

export interface ClaimScanStore {
  listTrackedAccounts(network: SomniaNetwork): Promise<readonly string[]>;
  readCheckpoint(network: SomniaNetwork): Promise<{ offset: number; completed: boolean }>;
  writeCheckpoint(network: SomniaNetwork, offset: number, completed: boolean): Promise<void>;
  upsertCandidates(candidates: readonly ClaimCandidate[]): Promise<void>;
}

export class FinalizedMarketScanner {
  constructor(
    private readonly options: {
      network: SomniaNetwork;
      reader: FinalizedMarketReader;
      store: ClaimScanStore;
      pageSize?: number;
    },
  ) {}

  async runOnce(signal?: AbortSignal): Promise<{ markets: number; candidates: number; completed: boolean }> {
    const pageSize = this.options.pageSize ?? 50;
    const checkpoint = await this.options.store.readCheckpoint(this.options.network);
    let offset = checkpoint.completed ? 0 : checkpoint.offset;
    let markets = 0;
    let candidates = 0;
    const accounts = await this.options.store.listTrackedAccounts(this.options.network);

    while (!signal?.aborted) {
      const page = await this.options.reader.listHistoricalMarkets({
        limit: pageSize,
        offset,
        ...(signal ? { signal } : {}),
      });
      const finalized = [...page]
        .filter((market) => market.finalized || market.status === "resolved" || market.status === "voided")
        .sort((left, right) => Date.parse(right.expiresAt) - Date.parse(left.expiresAt));
      for (const market of finalized) {
        if (signal?.aborted) break;
        const found: ClaimCandidate[] = [];
        for (const account of accounts) {
          const balances = await this.options.reader.getOutcomeBalances(account, market.marketId, signal);
          if (!balances) continue;
          for (const [outcome, amount, tokenId] of [
            ["up", balances.up, market.upTokenId],
            ["down", balances.down, market.downTokenId],
          ] as const) {
            if (BigInt(amount) === BigInt(0)) continue;
            const expectedPayout = payout(market, outcome, BigInt(amount));
            found.push(
              ClaimCandidateSchema.parse({
                network: this.options.network,
                account,
                marketId: market.marketId,
                outcome,
                tokenId,
                amount,
                estimatedPayout: expectedPayout.toString(),
                status: expectedPayout > BigInt(0) ? "claimable" : "no_value",
                expiresAt: market.expiresAt,
                resolution: market.resolution,
                freshness: balances.freshness,
              }),
            );
          }
        }
        await this.options.store.upsertCandidates(found);
        markets += 1;
        candidates += found.length;
      }
      if (signal?.aborted) return { markets, candidates, completed: false };
      offset += page.length;
      const completed = page.length < pageSize;
      await this.options.store.writeCheckpoint(this.options.network, offset, completed);
      if (completed) return { markets, candidates, completed: true };
    }
    return { markets, candidates, completed: false };
  }
}

export async function runClaimScannerOnSchedule(
  scanner: FinalizedMarketScanner,
  intervalMilliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    await scanner.runOnce(signal);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMilliseconds);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}

function payout(market: NormalizedMarket, outcome: "up" | "down", amount: bigint) {
  const numerator = outcome === "up" ? market.resolution.payoutUp : market.resolution.payoutDown;
  const denominator = market.resolution.payoutDenominator;
  if (numerator !== null && denominator !== null && BigInt(denominator) > BigInt(0)) {
    return (amount * BigInt(numerator)) / BigInt(denominator);
  }
  if (market.resolution.state === "voided") return amount / BigInt(2);
  return market.resolution.winningOutcome === outcome ? amount : BigInt(0);
}
