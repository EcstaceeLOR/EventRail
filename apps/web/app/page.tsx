import Link from "next/link";
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
            <em>Build the experience.</em>
          </h1>
          <p>
            EventRail makes DreamDEX markets safe to trade and effortless to embed—from one wallet flow to a
            complete prediction product.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/markets">
              Explore markets <span>→</span>
            </Link>
            <Link className="secondary-button" href="/developers">
              Start building
            </Link>
          </div>
          <div className="trust-row">
            <span>Non-custodial</span>
            <span>Live on Somnia</span>
            <span>Built on DreamDEX</span>
          </div>
        </div>
        <div className="hero-visual" aria-label="Live market preview">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="spotlight-card">
            <div className="spotlight-header">
              <span>Featured market</span>
              <span className="live-chip">
                <i /> Live
              </span>
            </div>
            <h2>{markets[0]?.question}</h2>
            <div className="big-probability">
              <strong>64%</strong>
              <span>market probability</span>
            </div>
            <svg
              className="hero-chart"
              viewBox="0 0 520 150"
              role="img"
              aria-label="Probability trending upward"
            >
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#74fbc0" stopOpacity=".34" />
                  <stop offset="1" stopColor="#74fbc0" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 120 C45 118 50 100 92 105 S160 82 197 91 S252 46 300 65 S358 74 398 42 S465 34 520 8 L520 150 L0 150 Z"
                fill="url(#area)"
              />
              <path
                d="M0 120 C45 118 50 100 92 105 S160 82 197 91 S252 46 300 65 S358 74 398 42 S465 34 520 8"
                fill="none"
                stroke="#74fbc0"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
            <div className="spotlight-actions">
              <Link href={`/markets/${markets[0]?.id}?side=yes`} className="yes-button">
                Buy Yes <b>64¢</b>
              </Link>
              <Link href={`/markets/${markets[0]?.id}?side=no`} className="no-button">
                Buy No <b>36¢</b>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="metric-strip">
        <div>
          <strong>{formatUsd(totalVolume)}</strong>
          <span>tracked volume</span>
        </div>
        <div>
          <strong>{markets.length}</strong>
          <span>live prototype markets</span>
        </div>
        <div>
          <strong>&lt; 1 sec</strong>
          <span>Somnia finality target</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>non-custodial</span>
        </div>
      </section>

      <section className="section-wrap section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Moving now</span>
            <h2>Markets worth watching</h2>
          </div>
          <Link href="/markets">View all markets →</Link>
        </div>
        <div className="market-grid">
          {markets.slice(0, 3).map((market) => (
            <MarketCard market={market} key={market.id} />
          ))}
        </div>
      </section>

      <section className="section-wrap builder-banner">
        <div>
          <span className="eyebrow">For builders</span>
          <h2>
            One integration.
            <br />
            Every event contract.
          </h2>
          <p>
            Use a typed API, headless hooks, or polished components. EventRail handles market discovery,
            rollover, transaction planning, positions, and claims.
          </p>
          <Link className="primary-button" href="/developers">
            Read the developer overview <span>→</span>
          </Link>
        </div>
        <pre aria-label="React SDK example">
          <code>
            <span>import</span> {"{ useEventMarket }"} <span>from</span>
            {"\n"} <b>&quot;@eventrail/react&quot;</b>
            {"\n\n"}
            <span>const</span> {"{ market, trade }"} ={"\n"} useEventMarket(<b>&quot;somnia-tvl&quot;</b>);
            {"\n\n"}
            <span>await</span> trade({"{"} outcome: <b>&quot;yes&quot;</b>, amount: <b>25</b> {"}"});
          </code>
        </pre>
      </section>
    </>
  );
}
