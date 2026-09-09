"use client";
import { useMemo, useState } from "react";
export function CopyCode({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <pre className="code">
      <button
        className="copy"
        onClick={async () => {
          await navigator.clipboard.writeText(children);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <code>{children}</code>
    </pre>
  );
}
const endpoints = [
  ["GET", "/v1/data/series", "Rolling event-market series"],
  ["GET", "/v1/data/markets", "Live DreamDEX markets"],
  ["GET", "/v1/data/markets/{marketId}/book", "Authoritative depth"],
  ["POST", "/v1/trading/quotes", "Executable quote"],
  ["POST", "/v1/trading/plans", "Non-custodial wallet plan"],
  ["GET", "/v1/data/accounts/{account}/positions", "Portfolio positions"],
  ["POST", "/v1/redemptions/plans", "Winner-only claim plan"],
  ["GET", "/v1/events", "Resumable SSE stream"],
] as const;
export function ApiExplorer() {
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => endpoints.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  return (
    <>
      <input
        className="search"
        placeholder="Search paths, methods, resources…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {shown.map(([method, path, description]) => (
        <a
          className="endpoint"
          id={path.replace(/\W/g, "-")}
          key={path}
          href={`#${path.replace(/\W/g, "-")}`}
        >
          <span className="method">{method}</span>
          <span>
            <code>{path}</code>
            <p>{description}</p>
          </span>
        </a>
      ))}
    </>
  );
}
export function SettingsConsole() {
  const [theme, setTheme] = useState("midnight");
  const [origin, setOrigin] = useState("http://localhost:3000");
  return (
    <div className="grid">
      <form className="card form" onSubmit={(e) => e.preventDefault()}>
        <h3>Embed settings</h3>
        <label>
          Allowed origin
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </label>
        <label>
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="midnight">Midnight</option>
            <option value="paper">Paper</option>
            <option value="signal">Signal</option>
          </select>
        </label>
        <label>
          Default spend
          <input defaultValue="20" inputMode="numeric" />
        </label>
        <button className="primary">Save validated config</button>
      </form>
      <div className={`preview ${theme}`}>
        <span className="eyebrow">Live preview · {theme}</span>
        <div className="market">
          <p>BTC / 5 minute</p>
          <h3>Will BTC close higher this interval?</h3>
          <p>Connected from {origin}</p>
          <button>Trade UP · 0.54</button>
        </div>
      </div>
    </div>
  );
}
