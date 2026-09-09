import { CopyCode } from "../../components";
const install = "pnpm add @eventrail/react @eventrail/api-client";
const sample = `import { EventRailEmbedProvider, EventRailMarketCard } from "@eventrail/react";\nimport "@eventrail/react/styles.css";\n\n<EventRailEmbedProvider baseUrl="https://api.eventrail.xyz" apiKey={publicKey} config={config}>\n  <EventRailMarketCard marketId={marketId} onTrade={setOutcome} />\n</EventRailEmbedProvider>`;
export default function Quickstart() {
  return (
    <main className="page doc-layout">
      <aside className="side">
        <span className="eyebrow">Get started</span>
        <a href="#install">Install</a>
        <a href="#render">Render</a>
        <a href="#wallet">Wallet boundary</a>
        <a href="#testnet">Testnet proof</a>
      </aside>
      <article className="doc">
        <span className="eyebrow">Quickstart · 5 minutes</span>
        <h1>Ship your first live embed.</h1>
        <p className="lede">
          Create a browser key in the console, allow your local origin, and render a production-safe market
          card.
        </p>
        <h2 id="install">1. Install</h2>
        <CopyCode>{install}</CopyCode>
        <h2 id="render">2. Render</h2>
        <CopyCode>{sample}</CopyCode>
        <h2 id="wallet">3. Keep the wallet in your host</h2>
        <p>
          The trade sheet returns a typed quote or plan to your callback. Your own wagmi or viem wallet asks
          for approval and sends every transaction.
        </p>
        <h2 id="testnet">Shannon transaction proof</h2>
        <p>
          The reference flow has minted a complete set and redeemed its winning UP outcome on Somnia Shannon.
        </p>
        <a
          className="secondary"
          target="_blank"
          rel="noreferrer"
          href="https://shannon-explorer.somnia.network/tx/0x29b9fd5624f93fed56e36e4c4778cde61807f764bf79000dd92a128178e0d595"
        >
          Inspect redemption ↗
        </a>
      </article>
    </main>
  );
}
