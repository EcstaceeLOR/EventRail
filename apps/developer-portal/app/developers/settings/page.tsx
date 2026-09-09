import { SettingsConsole } from "../../components";
export default function Settings() {
  return (
    <main className="page">
      <span className="eyebrow">Integrator console</span>
      <h2>Keys, origins & embed</h2>
      <p className="lede">
        Preview tenant styling and mandatory risk controls before copying the configuration into your
        application.
      </p>
      <SettingsConsole />
      <section className="card" style={{ marginTop: 16 }}>
        <h3>API keys</h3>
        <div className="endpoint">
          <span className="method">PUBLIC</span>
          <span>
            <code>er_pk_test_82aa…</code>
            <p>http://localhost:3000 · 120 rpm · active</p>
          </span>
        </div>
        <div className="endpoint">
          <span className="method">SERVER</span>
          <span>
            <code>er_sk_test_105c…</code>
            <p>Secret redacted forever · rotate or revoke</p>
          </span>
        </div>
      </section>
    </main>
  );
}
