"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { EventRailClient } from "@eventrail/api-client";
import type {
  DataFreshness,
  MarketSeries,
  NormalizedClaim,
  NormalizedCandle,
  NormalizedFill,
  NormalizedMarket,
  NormalizedOrderBook,
  PortfolioPosition,
  ResolutionSnapshot,
  OutcomeBalances,
  SomniaNetwork,
  TradeActivity,
} from "@eventrail/types";

export type DataViewState = "loading" | "live" | "stale" | "offline" | "terminal";

export interface LiveDataView<T> {
  query: UseQueryResult<T>;
  state: DataViewState;
}

interface EventRailContextValue {
  client: EventRailClient;
  network: SomniaNetwork;
}

const EventRailContext = createContext<EventRailContextValue | null>(null);

export interface EventRailProviderProps {
  client: EventRailClient;
  network?: SomniaNetwork;
  children: ReactNode;
}

export function EventRailProvider({ client, network = "shannon", children }: EventRailProviderProps) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      for await (const { event } of client.subscribeEvents({ network, signal: controller.signal })) {
        if (event.type === "market.rolled-over" || event.type === "market.updated") {
          await queryClient.invalidateQueries({ queryKey: queryKeys.series(network) });
          await queryClient.invalidateQueries({ queryKey: queryKeys.markets(network) });
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.market(event.marketId) });
        if (event.type === "book.updated" || event.type === "fill.created") {
          await queryClient.invalidateQueries({ queryKey: queryKeys.book(event.marketId) });
          await queryClient.invalidateQueries({ queryKey: queryKeys.trades(event.marketId) });
        }
        if (
          event.type === "position.updated" ||
          event.type === "transaction.updated" ||
          event.type === "claim.updated" ||
          event.type === "market.settled"
        ) {
          await queryClient.invalidateQueries({ queryKey: ["eventrail", "account"] });
        }
      }
    })().catch(() => queryClient.invalidateQueries({ queryKey: ["eventrail"] }));
    return () => controller.abort();
  }, [client, network, queryClient]);
  return <EventRailContext.Provider value={{ client, network }}>{children}</EventRailContext.Provider>;
}

export const queryKeys = {
  series: (network: SomniaNetwork) => ["eventrail", "series", network] as const,
  markets: (network: SomniaNetwork) => ["eventrail", "markets", network] as const,
  market: (marketId: string) => ["eventrail", "market", marketId] as const,
  resolution: (marketId: string) => ["eventrail", "market", marketId, "resolution"] as const,
  book: (marketId: string) => ["eventrail", "book", marketId] as const,
  trades: (marketId: string) => ["eventrail", "trades", marketId] as const,
  candles: (marketId: string, intervalSeconds: number) =>
    ["eventrail", "candles", marketId, intervalSeconds] as const,
  balances: (account: string, marketId: string) =>
    ["eventrail", "account", account, "balances", marketId] as const,
  positions: (account: string) => ["eventrail", "account", account, "positions"] as const,
  claims: (account: string) => ["eventrail", "account", account, "claims"] as const,
  activity: (account: string, marketId: string, status: string) =>
    ["eventrail", "account", account, "activity", marketId, status] as const,
};

export function useSeries(): LiveDataView<readonly MarketSeries[]> {
  const { client, network } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.series(network),
    queryFn: ({ signal }) => client.listSeries(network, signal),
  });
  return view(query, query.data?.[0]?.freshness);
}

export function useMarkets(): LiveDataView<readonly NormalizedMarket[]> {
  const { client, network } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.markets(network),
    queryFn: ({ signal }) => client.listLiveMarkets(network, signal),
    refetchInterval: 10_000,
  });
  return view(query, query.data?.[0]?.freshness);
}

export function useEventRailClient(): EventRailClient {
  return useEventRail().client;
}

export function useMarket(marketId: string): LiveDataView<NormalizedMarket> {
  const { client } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.market(marketId),
    queryFn: ({ signal }) => client.getMarket(marketId, signal),
    enabled: marketId.length > 0,
  });
  return view(
    query,
    query.data?.freshness,
    query.data?.status === "resolved" || query.data?.status === "voided",
  );
}

export function useResolution(marketId: string): LiveDataView<ResolutionSnapshot> {
  const { client } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.resolution(marketId),
    queryFn: ({ signal }) => client.getResolution(marketId, signal),
    enabled: marketId.length > 0,
  });
  return view(query, query.data?.freshness, query.data?.resolution.state !== "unresolved");
}

export function useOrderBook(marketId: string): LiveDataView<NormalizedOrderBook> {
  const { client } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.book(marketId),
    queryFn: ({ signal }) => client.getOrderBook(marketId, signal),
    enabled: marketId.length > 0,
    staleTime: 2_000,
  });
  return view(query, query.data?.freshness);
}

export function useTrades(marketId: string): LiveDataView<readonly NormalizedFill[]> {
  const { client } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.trades(marketId),
    queryFn: ({ signal }) => client.getTrades(marketId, signal),
    enabled: marketId.length > 0,
  });
  return view(query);
}

export function useCandles(
  marketId: string,
  intervalSeconds: number,
): LiveDataView<readonly NormalizedCandle[]> {
  const { client } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.candles(marketId, intervalSeconds),
    queryFn: ({ signal }) => client.getCandles(marketId, intervalSeconds, signal),
    enabled: marketId.length > 0 && intervalSeconds > 0,
  });
  return view(query);
}

export function useBalances(account: string, marketId: string): LiveDataView<OutcomeBalances> {
  const { client } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.balances(account, marketId),
    queryFn: ({ signal }) => client.getBalances(account, marketId, signal),
    enabled: account.length > 0 && marketId.length > 0,
  });
  return view(query, query.data?.freshness);
}

export function usePositions(account: string): LiveDataView<readonly PortfolioPosition[]> {
  const { client } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.positions(account),
    queryFn: ({ signal }) => client.getPositions(account, signal),
    enabled: account.length > 0,
  });
  return view(query, query.data?.[0]?.freshness);
}

export function useClaims(account: string): LiveDataView<readonly NormalizedClaim[]> {
  const { client } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.claims(account),
    queryFn: ({ signal }) => client.getClaims(account, signal),
    enabled: account.length > 0,
  });
  return view(query, query.data?.[0]?.freshness);
}

export function useActivity(
  account: string,
  filters: { marketId?: string; status?: string } = {},
): LiveDataView<readonly TradeActivity[]> {
  const { client, network } = useEventRail();
  const query = useQuery({
    queryKey: queryKeys.activity(account, filters.marketId ?? "", filters.status ?? ""),
    queryFn: ({ signal }) => client.getActivity(account, { network, ...filters }, signal),
    enabled: account.length > 0,
  });
  return view(query);
}

export function classifyDataState(input: {
  pending: boolean;
  error: boolean;
  freshness?: DataFreshness;
  terminal?: boolean;
  now?: Date;
}): DataViewState {
  if (input.pending) return "loading";
  if (input.error) return "offline";
  if (input.terminal) return "terminal";
  if (
    input.freshness &&
    (input.freshness.state !== "fresh" ||
      Date.parse(input.freshness.staleAt) <= (input.now ?? new Date()).getTime())
  )
    return "stale";
  return "live";
}

function useEventRail(): EventRailContextValue {
  const value = useContext(EventRailContext);
  if (!value) throw new Error("EventRail hooks must be used inside EventRailProvider");
  return value;
}

function view<T>(query: UseQueryResult<T>, freshness?: DataFreshness, terminal = false): LiveDataView<T> {
  return {
    query,
    state: classifyDataState({
      pending: query.isPending,
      error: query.isError && query.data === undefined,
      ...(freshness ? { freshness } : {}),
      terminal,
    }),
  };
}
