import Link from "next/link";
export default function Developers() {
  return (
    <main className="page">
      <span className="eyebrow">Infrastructure for event contracts</span>
      <h1>Go from idea to live market in one afternoon.</h1>
      <p className="lede">
        One typed API and a wallet-safe React SDK for DreamDEX live markets, execution, rollover, positions,
        oracle evidence, and claims.
      </p>
      <div className="actions">
        <Link className="primary" href="/developers/quickstart">
          Start building →
        </Link>
        <Link className="secondary" href="/developers/api">
          Explore the API
        </Link>
      </div>
      <section className="grid">
        <article className="card">
          <code>01 / DATA</code>
          <h3>DreamDEX, normalized</h3>
          <p>Live order books and fills with source blocks, stale times, and resolution evidence.</p>
        </article>
        <article className="card">
          <code>02 / EXECUTION</code>
          <h3>Wallet-controlled plans</h3>
          <p>Bounded quotes and deterministic calls. EventRail never holds a key or submits for a user.</p>
        </article>
        <article className="card">
          <code>03 / LIFECYCLE</code>
          <h3>Built past the trade</h3>
          <p>Follow a position through rollover, settlement, oracle proof, and winner-only redemption.</p>
        </article>
      </section>
    </main>
  );
}
