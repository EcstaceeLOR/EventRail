export const ANALYTICS_EVENTS = [
  "impression",
  "wallet_connected",
  "quote_created",
  "wallet_signature_requested",
  "transaction_submitted",
  "trade_filled",
  "funding_completed",
  "claim_completed",
  "market_rolled_over",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];
export interface AnalyticsEvent {
  id: string;
  integratorId: string;
  environment: "test" | "live";
  embedId: string;
  name: AnalyticsEventName;
  marketId?: string;
  transactionHash?: string;
  volume?: string;
  occurredAt: string;
}
export function deduplicateAnalytics(events: readonly AnalyticsEvent[]): AnalyticsEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = event.transactionHash
      ? `${event.name}:${event.transactionHash.toLowerCase()}`
      : `${event.integratorId}:${event.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function summarizeAnalytics(events: readonly AnalyticsEvent[]) {
  const unique = deduplicateAnalytics(events);
  const count = (name: AnalyticsEventName) => unique.filter((event) => event.name === name).length;
  const impressions = count("impression");
  const connects = count("wallet_connected");
  const submissions = count("transaction_submitted");
  const fills = count("trade_filled");
  return {
    impressions,
    connects,
    quotes: count("quote_created"),
    signatures: count("wallet_signature_requested"),
    submissions,
    fills,
    volume: unique
      .filter((event) => event.name === "trade_filled")
      .reduce((sum, event) => sum + BigInt(event.volume ?? "0"), 0n)
      .toString(),
    claims: count("claim_completed"),
    rollovers: count("market_rolled_over"),
    connectRate: impressions === 0 ? 0 : connects / impressions,
    fillRate: submissions === 0 ? 0 : fills / submissions,
  };
}
