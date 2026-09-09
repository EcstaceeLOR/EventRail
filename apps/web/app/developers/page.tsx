import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Developers" };

const capabilities = [
  ["Discover", "Normalized markets, phases, prices, and liquidity across active DreamDEX contracts."],
  ["Transact", "Inspect and simulate non-custodial transaction plans before the user's wallet signs."],
  ["Reconcile", "Stream fills, discover positions, follow resolution, and prepare claims."],
] as const;

export default function DevelopersPage() {
  return <section className="section-wrap page-section developer-page"><div className="developer-hero"><span className="eyebrow">EventRail for builders</span><h1>Ship a prediction product,<br /><em>not a protocol integration.</em></h1><p>Compose DreamDEX Event Contracts with a typed API, React hooks, realtime streams, and safe transaction plans.</p><div className="hero-actions"><Link className="primary-button" href="/developers/dashboard">Open developer dashboard <span>→</span></Link><a className="secondary-button" href="#quickstart">View quickstart</a></div></div><div className="capability-grid">{capabilities.map(([title, copy], index) => <article key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{copy}</p></article>)}</div><div className="quickstart" id="quickstart"><div><span className="eyebrow">Three-minute quickstart</span><h2>A market feed in six lines.</h2><p>Install the headless React SDK, provide an EventRail client, and retain complete control over your interface.</p></div><pre><code><span>import</span> {'{ useMarkets }'} <span>from</span> <b>&quot;@eventrail/react&quot;</b>;{'\n\n'}<span>export function</span> MarketFeed() {'{'}{'\n'}  <span>const</span> {'{ data, isLoading }'} = useMarkets();{'\n'}  <span>return</span> isLoading ? &lt;Loader /&gt; : &lt;Grid markets={'{'}data{'}'} /&gt;;{'\n'}{'}'}</code></pre></div></section>;
}
