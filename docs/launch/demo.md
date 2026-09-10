# Demo runbook

Target length: six minutes. Open the consumer app, developer portal, examples, status page, Somnia explorer, and this fallback recording before presenting.

1. Start on Discover and explain that EventRail turns DreamDEX event contracts into a safer, continuously indexed consumer journey. Open a live market and point out resolution, countdown, executable liquidity, slippage, and provenance.
2. Connect the demo wallet. Request a quote and show its expiry and policy bounds. Build the unsigned transaction plan, inspect the calls, then sign in the wallet. EventRail never receives a private key.
3. Open Activity/Portfolio and trace planned, submitted, confirmed, and filled state. Show rollover navigation from an expired market into its successor.
4. Open Claims, create a redemption plan for a resolved winning position, sign it, then show the Somnia explorer transaction as on-chain evidence.
5. Open Analytics to show impressions-to-wallet-to-plan-to-confirmed conversion without exposing wallet secrets.
6. Open the developer portal and each of the three embeds in Examples: market card, trade ticket, and portfolio/claims. Show the typed SDK call and webhook replay path.
7. Finish on Status. Explain upstream DreamDEX/RPC degradation, the public incident history/feed, and the planning kill switch.

Before judging, execute `pnpm smoke:production`, record the commit SHA and transaction links, and reset the wallet to enough STT/USDso. The fallback video must show the same journey with the deployed SHA and a visible timestamp. If a live dependency fails, state it plainly, switch to the recording, then use the status page and explorer evidence instead of simulating a successful transaction.
