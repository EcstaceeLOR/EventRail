"use client";
import { useState } from "react";
import { EVENTRAIL_THEMES, type EmbedTheme } from "@eventrail/platform";
import {
  EventRailClaims,
  EventRailEmbedProvider,
  EventRailMarketCard,
  EventRailOracleProof,
  EventRailPositions,
  EventRailTradeSheet,
  useMarkets,
} from "@eventrail/react";
const baseUrl = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:4000";
const apiKey = process.env.NEXT_PUBLIC_EVENTRAIL_API_KEY;
const account = process.env.NEXT_PUBLIC_EXAMPLE_ACCOUNT ?? "";
export function ExampleWidget({
  theme = EVENTRAIL_THEMES.midnight,
  mode,
}: {
  theme?: EmbedTheme;
  mode: "wallet" | "streamer" | "community";
}) {
  const config = {
    version: "1" as const,
    name: `EventRail ${mode}`,
    logoUrl: null,
    theme,
    allowedAssets: ["BTC", "ETH"],
    allowedCadences: [300, 900],
    defaultSpend: "1000000",
    risk: {
      maxSpend: "100000000",
      maxSlippageBps: 100,
      minimumFillBps: 9000,
      minimumTimeRemainingSeconds: 30,
    },
    callbacks: { onTradePrepared: true, onTransactionSubmitted: true },
  };
  return (
    <EventRailEmbedProvider baseUrl={baseUrl} {...(apiKey ? { apiKey } : {})} config={config}>
      <LiveExample mode={mode} />
    </EventRailEmbedProvider>
  );
}
function LiveExample({ mode }: { mode: "wallet" | "streamer" | "community" }) {
  const markets = useMarkets();
  const market = markets.query.data?.[0];
  const [outcome, setOutcome] = useState<"up" | "down" | null>(null);
  const [notice, setNotice] = useState("");
  if (!market)
    return (
      <div className="preview">
        <p>
          {markets.state === "loading"
            ? "Finding the current DreamDEX event contract…"
            : "Start the EventRail gateway to load the live widget."}
        </p>
      </div>
    );
  return (
    <div className="widget-grid">
      <div className="panel">
        <EventRailMarketCard marketId={market.marketId} onTrade={setOutcome} />
        {outcome ? (
          <EventRailTradeSheet
            marketId={market.marketId}
            outcome={outcome}
            onTradePrepared={(quote) =>
              setNotice(`Quote ready at block ${quote.sourceBlock}. Your wallet remains in control.`)
            }
          />
        ) : null}
        {notice ? <p>{notice}</p> : null}
      </div>
      <div className="panel">
        {mode === "wallet" && account ? (
          <>
            <EventRailPositions account={account} />
            <EventRailClaims account={account} />
          </>
        ) : (
          <EventRailOracleProof marketId={market.marketId} />
        )}
      </div>
    </div>
  );
}
