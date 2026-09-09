import { ApiExplorer } from "../../components";
export default function Api() {
  return (
    <main className="page doc-layout">
      <aside className="side">
        <span className="eyebrow">Reference</span>
        <a href="#authentication">Authentication</a>
        <a href="#errors">Errors</a>
        <a href="#freshness">Freshness</a>
      </aside>
      <article className="doc">
        <span className="eyebrow">API reference · v1</span>
        <h1>Small surface. Full lifecycle.</h1>
        <p className="lede" id="authentication">
          Bearer keys select test or live environments. Browser keys are origin-bound; server keys are shown
          once and stored only as hashes.
        </p>
        <ApiExplorer />
        <h2 id="errors">Typed errors</h2>
        <p>Every failure returns a stable code, human message, request ID, and whether retrying is safe.</p>
        <h2 id="freshness">Freshness</h2>
        <p>
          Market responses state the observed block, observation time, stale deadline, and whether the source
          is authoritative.
        </p>
      </article>
    </main>
  );
}
