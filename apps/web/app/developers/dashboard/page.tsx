import type { Metadata } from "next";

export const metadata: Metadata = { title: "Developer dashboard" };

export default function DeveloperDashboardPage() {
  return (
    <section className="section-wrap page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Integrator console</span>
          <h1>Developer dashboard</h1>
          <p>Manage environments, origins, API keys, and usage.</p>
        </div>
        <button className="primary-button" type="button">
          Create project
        </button>
      </div>
      <div className="dashboard-grid">
        <article className="dashboard-card wide">
          <span className="eyebrow">Get started</span>
          <h2>Create your first EventRail project</h2>
          <p>Projects separate credentials, quotas, webhooks, and attribution for each integration.</p>
          <ol>
            <li>
              <b>01</b>
              <span>Create a project</span>
            </li>
            <li>
              <b>02</b>
              <span>Add an allowed origin</span>
            </li>
            <li>
              <b>03</b>
              <span>Generate a scoped API key</span>
            </li>
          </ol>
        </article>
        <article className="dashboard-card">
          <span className="eyebrow">API health</span>
          <div className="status-value">
            <i /> Operational
          </div>
          <p>All gateway regions are responding normally.</p>
        </article>
        <article className="dashboard-card">
          <span className="eyebrow">Requests</span>
          <strong className="large-number">0</strong>
          <p>Current billing period</p>
        </article>
      </div>
    </section>
  );
}
