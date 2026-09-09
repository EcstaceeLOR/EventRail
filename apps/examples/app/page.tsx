import Link from "next/link";
export default function Page() {
  return (
    <main className="gallery">
      <p className="label">EVENTRAIL / EXAMPLES</p>
      <h1>
        Three products.
        <br />
        One event rail.
      </h1>
      <p>
        Each reference integration consumes the public package boundary and live gateway—no private imports or
        fixture shortcuts.
      </p>
      <div className="gallery-grid">
        <Link href="/wallet">
          <b>01</b>
          <h2>Wallet terminal</h2>
          <span>Portfolio-native event trading →</span>
        </Link>
        <Link href="/streamer">
          <b>02</b>
          <h2>Streamer overlay</h2>
          <span>Audience prediction moments →</span>
        </Link>
        <Link href="/community">
          <b>03</b>
          <h2>Community pulse</h2>
          <span>Shared market conversations →</span>
        </Link>
      </div>
    </main>
  );
}
