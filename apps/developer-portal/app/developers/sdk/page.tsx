import { CopyCode } from "../../components";
export default function Sdk() {
  return (
    <main className="page doc-layout">
      <aside className="side">
        <span className="eyebrow">React SDK</span>
        <a href="#components">Components</a>
        <a href="#hooks">Headless hooks</a>
        <a href="#themes">Themes</a>
        <a href="#ssr">SSR</a>
      </aside>
      <article className="doc">
        <span className="eyebrow">@eventrail/react</span>
        <h1>Composable by default.</h1>
        <p className="lede">
          Use polished primitives or only typed hooks. The package is tree-shakeable, SSR-safe, and leaves
          wallet signing to the host.
        </p>
        <h2 id="components">Components</h2>
        <div className="grid">
          <div className="card">
            <code>MarketCard</code>
            <p>Live market state and entry point.</p>
          </div>
          <div className="card">
            <code>TradeSheet</code>
            <p>Bounded quote preparation.</p>
          </div>
          <div className="card">
            <code>OracleProof</code>
            <p>Verifiable settlement evidence.</p>
          </div>
        </div>
        <h2 id="hooks">Headless hooks</h2>
        <CopyCode>{`const market = useMarket(marketId);\nconst book = useOrderBook(marketId);\nconst positions = usePositions(account);\nconst claims = useClaims(account);`}</CopyCode>
        <h2 id="themes">Theme tokens</h2>
        <p>
          Midnight, Paper, and Signal presets customize color and radius tokens without weakening spend, fill,
          slippage, or expiry guardrails.
        </p>
        <h2 id="ssr">SSR-safe loading</h2>
        <p>
          All stateful widgets declare a client boundary. Their package entry can be imported by Next.js
          server modules without touching window during evaluation.
        </p>
      </article>
    </main>
  );
}
