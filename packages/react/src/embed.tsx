"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EventRailClient } from "@eventrail/api-client";
import { validateEmbedConfig, type EmbedConfig } from "@eventrail/platform";
import type { TradeQuote } from "@eventrail/types";
import { Button, Card, Skeleton, StatusBadge } from "./components.js";
import {
  EventRailProvider,
  useClaims,
  useEventRailClient,
  useMarket,
  usePositions,
  useResolution,
} from "./live-data.js";

export class EventRailEmbedError extends Error {
  constructor(
    readonly code: "INVALID_CONFIG" | "QUOTE_FAILED",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EventRailEmbedError";
  }
}

export interface EventRailEmbedProviderProps {
  baseUrl: string;
  apiKey?: string;
  config: EmbedConfig;
  children: ReactNode;
}

export function EventRailEmbedProvider({
  baseUrl,
  apiKey,
  config: input,
  children,
}: EventRailEmbedProviderProps) {
  const config = useMemo(() => {
    try {
      return validateEmbedConfig(input);
    } catch (error) {
      throw new EventRailEmbedError(
        "INVALID_CONFIG",
        "The embed configuration is unsafe or malformed.",
        error,
      );
    }
  }, [input]);
  const client = useMemo(
    () => new EventRailClient({ baseUrl, ...(apiKey ? { apiKey } : {}) }),
    [apiKey, baseUrl],
  );
  const queryClient = useMemo(() => new QueryClient(), []);
  const style = {
    "--er-surface": config.theme.surface,
    "--er-surface-raised": config.theme.surfaceRaised,
    "--er-text": config.theme.text,
    "--er-muted": config.theme.muted,
    "--er-accent": config.theme.accent,
    "--er-positive": config.theme.positive,
    "--er-negative": config.theme.negative,
    "--er-radius":
      config.theme.radius === "compact" ? "8px" : config.theme.radius === "round" ? "24px" : "14px",
  } as CSSProperties;
  return (
    <div className="eventrail-embed" style={style}>
      <QueryClientProvider client={queryClient}>
        <EventRailProvider client={client}>{children}</EventRailProvider>
      </QueryClientProvider>
    </div>
  );
}

export function EventRailMarketCard({
  marketId,
  onTrade,
}: {
  marketId: string;
  onTrade?: (outcome: "up" | "down") => void;
}) {
  const market = useMarket(marketId);
  if (market.state === "loading")
    return (
      <Card>
        <Skeleton height="10rem" />
      </Card>
    );
  if (!market.query.data)
    return (
      <Card>
        <StatusBadge tone="danger">Offline</StatusBadge>
        <p>Market data is unavailable.</p>
      </Card>
    );
  const value = market.query.data;
  return (
    <Card elevated className="er-embed-market">
      <div className="er-embed-row">
        <span>
          {value.asset} · {Number(value.cadence.intervalSeconds) / 60}m
        </span>
        <StatusBadge tone={market.state === "live" ? "live" : "warning"}>{market.state}</StatusBadge>
      </div>
      <h3>{value.question}</h3>
      <p>
        Last price <strong>{value.lastPrice ?? "—"}</strong>
      </p>
      <div className="er-embed-actions">
        <Button onClick={() => onTrade?.("up")}>Trade up</Button>
        <Button variant="secondary" onClick={() => onTrade?.("down")}>
          Trade down
        </Button>
      </div>
    </Card>
  );
}

export function EventRailTradeSheet({
  marketId,
  outcome,
  onTradePrepared,
}: {
  marketId: string;
  outcome: "up" | "down";
  onTradePrepared: (quote: TradeQuote) => void;
}) {
  const [amount, setAmount] = useState("1000000");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useEventRailClient();
  return (
    <Card className="er-trade-sheet">
      <h3>Prepare {outcome.toUpperCase()} trade</h3>
      <label>
        Spend in raw USDso units
        <input value={amount} inputMode="numeric" onChange={(event) => setAmount(event.target.value)} />
      </label>
      {error ? <p className="er-embed-error">{error}</p> : null}
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const quote = await client.createTradeQuote({
              marketId,
              outcome,
              side: "buy",
              mode: "spend",
              amount,
            });
            onTradePrepared(quote);
          } catch {
            setError("A safe executable quote could not be prepared.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Review wallet transaction
      </Button>
      <small>Your host application controls wallet signing and submission.</small>
    </Card>
  );
}

export function EventRailPositions({ account }: { account: string }) {
  const view = usePositions(account);
  return (
    <Card>
      <h3>Positions</h3>
      {view.query.data?.length ? (
        view.query.data.map((position) => (
          <div className="er-embed-row" key={`${position.marketId}:${position.outcome}`}>
            <span>
              {position.asset} {position.outcome.toUpperCase()}
            </span>
            <strong>{position.balance}</strong>
          </div>
        ))
      ) : (
        <p>No open positions.</p>
      )}
    </Card>
  );
}
export function EventRailClaims({
  account,
  onClaim,
}: {
  account: string;
  onClaim?: (marketId: string) => void;
}) {
  const view = useClaims(account);
  return (
    <Card>
      <h3>Claims</h3>
      {view.query.data?.length ? (
        view.query.data.map((claim) => (
          <div className="er-embed-row" key={`${claim.marketId}:${claim.outcome}`}>
            <span>
              {claim.outcome.toUpperCase()} · {claim.estimatedPayout}
            </span>
            <Button onClick={() => onClaim?.(claim.marketId)}>Prepare claim</Button>
          </div>
        ))
      ) : (
        <p>No winning claims available.</p>
      )}
    </Card>
  );
}
export function EventRailOracleProof({ marketId }: { marketId: string }) {
  const view = useResolution(marketId);
  const evidence = view.query.data?.evidence;
  return (
    <Card>
      <h3>Oracle proof</h3>
      <p>{evidence?.question ?? "Resolution evidence is loading."}</p>
      {evidence?.explorerUrl ? (
        <a href={evidence.explorerUrl} target="_blank" rel="noreferrer">
          Verify on Somnia ↗
        </a>
      ) : (
        <StatusBadge tone="warning">{evidence?.state ?? "pending"}</StatusBadge>
      )}
    </Card>
  );
}
