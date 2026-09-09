import Link from "next/link";
import { LiveLandingPreview } from "../components/live-landing-preview";
import { MarketCard } from "../components/market-card";
import { formatUsd, markets } from "../lib/markets";

export default function HomePage() {
  const totalVolume = markets.reduce((total, market) => total + market.volumeUsd, 0);
  return (
    <>
      <section className="hero section-wrap">
        <div className="hero-copy">
          <span className="eyebrow">
            <i /> Event markets, finally composable
          </span>
          <h1>
            Trade the outcome.
            <br />
            <em>Keep the context.</em>
          </h1>
          <p>
            EventRail turns DreamDEX Event Contracts into a safe, continuous trading journey—from live depth
            to wallet-signed execution and settlement.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/markets">
              Explore live markets <span>→</span>
            </Link>
            <Link className="secondary-button" href="/developers">
              Start building
            </Link>
          </div>
          <div className="trust-row">
            <span>Non-custodial</span>
            <span>Live on Somnia</span>
            <span>DreamDEX-native</span>
          </div>
        </div>
        <LiveLandingPreview />
      </section>

      <section className="metric-strip" aria-label="EventRail trust model">
        <div>
          <strong>{formatUsd(totalVolume)}</strong>
          <span>reference volume</span>
        </div>
        <div>
          <strong>1 plan hash</strong>
          <span>from review to signature</span>
        </div>
        <div>
          <strong>IOC</strong>
          <span>no stale remainder</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>wallet controlled</span>
        </div>
      </section>

      <section className="section-wrap section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Explore the experience</span>
            <h2>Markets worth watching</h2>
          </div>
          <Link href="/markets">View live contracts →</Link>
        </div>
        <div className="market-grid">
          {markets.slice(0, 3).map((market) => (
            <MarketCard market={market} key={market.id} />
          ))}
        </div>
      </section>

      <section className="section-wrap trust-model">
        <div>
          <span className="eyebrow">Trust, made visible</span>
          <h2>Advice from EventRail. Authority from the chain.</h2>
        </div>
        <ol>
          <li>
            <b>01</b>
            <div>
              <strong>Quote</strong>
              <p>Walk current DreamDEX depth with hard slippage, fill, balance, and expiry bounds.</p>
            </div>
          </li>
          <li>
            <b>02</b>
            <div>
              <strong>Verify</strong>
              <p>Recompute the plan hash, recheck the market binding, and simulate exact calldata.</p>
            </div>
          </li>
          <li>
            <b>03</b>
            <div>
              <strong>Sign</strong>
              <p>Your connected wallet approves and submits. EventRail never receives private keys.</p>
            </div>
          </li>
          <li>
            <b>04</b>
            <div>
              <strong>Reconcile</strong>
              <p>Confirmed logs—not requested quantity—become the execution record.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section-wrap builder-banner">
        <div>
          <span className="eyebrow">For builders</span>
          <h2>
            One integration.
            <br />
            Every market generation.
          </h2>
          <p>
            Typed APIs and React hooks cover discovery, rollover-safe planning, positions, activity, and
            claims.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/developers">
              Developer overview <span>→</span>
            </Link>
            <Link className="secondary-button" href="/status">
              System status
            </Link>
          </div>
        </div>
        <pre aria-label="EventRail React integration example">
          <code>
            <span>import</span> {"{ useMarket, useOrderBook }"} <span>from</span>
            {"\n"}
            <b>&quot;@eventrail/react&quot;</b>
            {"\n\n"}
            <span>const</span> market = useMarket(<b>marketId</b>);{"\n"}
            <span>const</span> depth = useOrderBook(<b>marketId</b>);
          </code>
        </pre>
      </section>
    </>
  );
}
