"use client";

import { useMemo, useState } from "react";
import type { DisplayMarket } from "../lib/markets";
import { MarketCard } from "./market-card";

export function MarketExplorer({ markets }: Readonly<{ markets: readonly DisplayMarket[] }>) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = ["All", ...new Set(markets.map((market) => market.category))];
  const results = useMemo(() => markets.filter((market) => {
    const matchesCategory = category === "All" || market.category === category;
    const matchesQuery = market.question.toLowerCase().includes(query.trim().toLowerCase());
    return matchesCategory && matchesQuery;
  }), [category, markets, query]);

  return (
    <>
      <div className="market-filters">
        <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets" aria-label="Search markets" /></label>
        <div className="category-tabs">{categories.map((item) => <button className={item === category ? "active" : ""} type="button" onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
      </div>
      {results.length > 0 ? <div className="market-grid market-page-grid">{results.map((market) => <MarketCard market={market} key={market.id} />)}</div> : <div className="empty-state"><h2>No matching markets</h2><p>Try another search or reset your category filter.</p><button type="button" onClick={() => { setCategory("All"); setQuery(""); }}>Reset filters</button></div>}
    </>
  );
}
