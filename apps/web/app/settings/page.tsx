import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <section className="section-wrap page-section narrow-page"><div className="page-heading"><div><span className="eyebrow">Preferences</span><h1>Settings</h1><p>Control how EventRail presents data and transaction safeguards.</p></div></div><form className="settings-card"><label><span><b>Display currency</b><small>Used for estimates and portfolio value.</small></span><select defaultValue="USD"><option>USD</option><option>NGN</option><option>EUR</option></select></label><label><span><b>Price display</b><small>Show event prices as probability or cents.</small></span><select defaultValue="Probability"><option>Probability</option><option>Cents</option></select></label><label><span><b>Transaction simulation</b><small>Require a successful preflight before wallet signing.</small></span><input type="checkbox" defaultChecked /></label><label><span><b>Reduced motion</b><small>Limit non-essential interface animation.</small></span><input type="checkbox" /></label><button className="primary-button" type="submit">Save preferences</button></form></section>;
}
