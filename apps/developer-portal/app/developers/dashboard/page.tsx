const bars = [35, 51, 44, 70, 62, 86, 78, 92, 74, 96, 82, 100];
export default function Dashboard() {
  return (
    <main className="page">
      <span className="eyebrow">Test environment · last 30 days</span>
      <h2>Integration health</h2>
      <section className="stats">
        <div className="card stat">
          <span>Impressions</span>
          <strong>12,840</strong>
          <p>Unique embed loads</p>
        </div>
        <div className="card stat">
          <span>Wallet connects</span>
          <strong>38.4%</strong>
          <p>Connects ÷ impressions</p>
        </div>
        <div className="card stat">
          <span>Filled volume</span>
          <strong>$48.2k</strong>
          <p>Reconciled on-chain</p>
        </div>
        <div className="card stat">
          <span>Fill rate</span>
          <strong>91.7%</strong>
          <p>Fills ÷ submissions</p>
        </div>
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <h3>Conversion events</h3>
        <div className="chart" aria-label="Conversion event trend">
          {bars.map((height, index) => (
            <span className="bar" key={index} style={{ height: `${height}%` }} title={`${height}`} />
          ))}
        </div>
      </section>
      <section className="grid" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Webhook delivery</h3>
          <strong>99.98%</strong>
          <p>2 retries · 0 dead-lettered</p>
        </div>
        <div className="card">
          <h3>API usage</h3>
          <strong>72 / 120 rpm</strong>
          <p>Current browser-key quota</p>
        </div>
        <div className="card">
          <h3>Builder attribution</h3>
          <strong>Supported</strong>
          <p>Runtime cap is checked per pool.</p>
        </div>
      </section>
    </main>
  );
}
