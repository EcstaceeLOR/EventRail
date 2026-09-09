"use client";

import type { NormalizedCandle, NormalizedFill, NormalizedOrderBook } from "@eventrail/types";
import { useDeferredValue, useMemo } from "react";
import { formatUnits } from "viem";

export function ProbabilityChart({
  candles,
  decimals,
}: Readonly<{ candles: readonly NormalizedCandle[]; decimals: number }>) {
  const deferred = useDeferredValue(candles);
  const points = useMemo(() => deferred.slice(-80), [deferred]);
  if (points.length === 0)
    return (
      <div className="visual-empty">
        <strong>No probability history yet</strong>
        <span>The first fill will start this chart.</span>
      </div>
    );
  const width = 900;
  const height = 260;
  const values = points.map((candle) => Number(formatUnits(BigInt(candle.close), decimals)));
  const path = values
    .map(
      (value, index) =>
        `${(index / Math.max(1, values.length - 1)) * width},${height - Math.max(0, Math.min(1, value)) * height}`,
    )
    .join(" ");
  const latest = values.at(-1) ?? 0;
  return (
    <div className="probability-visual">
      <div className="visual-heading">
        <div>
          <strong>{(latest * 100).toFixed(1)}%</strong>
          <span>Up probability</span>
        </div>
        <span>{points.length} intervals</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Probability history ending at ${(latest * 100).toFixed(1)} percent`}
      >
        <polyline
          points={`${path} ${width},${height} 0,${height}`}
          fill="rgba(116,251,192,.10)"
          stroke="none"
        />
        <polyline
          points={path}
          fill="none"
          stroke="#74fbc0"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((candle, index) => (
          <circle
            key={`${candle.timestamp}-${index}`}
            cx={(index / Math.max(1, points.length - 1)) * width}
            cy={height - values[index]! * height}
            r="7"
            tabIndex={0}
            role="img"
            aria-label={`${new Date(candle.timestamp).toLocaleTimeString()}: ${(values[index]! * 100).toFixed(1)} percent`}
          >
            <title>
              {new Date(candle.timestamp).toLocaleString()} · {(values[index]! * 100).toFixed(1)}%
            </title>
          </circle>
        ))}
      </svg>
      <details className="accessible-data">
        <summary>View probability data table</summary>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Open</th>
              <th>Close</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            {points.slice(-20).map((candle) => (
              <tr key={candle.timestamp}>
                <td>{new Date(candle.timestamp).toLocaleString()}</td>
                <td>{percent(candle.open, decimals)}</td>
                <td>{percent(candle.close, decimals)}</td>
                <td>{formatUnits(BigInt(candle.quoteVolume), decimals)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function DepthVisualization({ book }: Readonly<{ book: NormalizedOrderBook | undefined }>) {
  if (!book)
    return (
      <div className="visual-empty">
        <strong>Order book unavailable</strong>
        <span>Depth will return after the live feed reconnects.</span>
      </div>
    );
  const rows = book.upBids.slice(0, 8).map((bid, index) => ({ bid, ask: book.upAsks[index] }));
  const max = rows.reduce(
    (value, row) => Math.max(value, Number(row.bid?.quantity ?? 0), Number(row.ask?.quantity ?? 0)),
    1,
  );
  return (
    <div className="depth-visual">
      <div className="depth-head">
        <span>Bid quantity</span>
        <span>Up price</span>
        <span>Ask quantity</span>
      </div>
      {rows.map((row, index) => (
        <div className="depth-level" key={`${row.bid?.price ?? "x"}-${row.ask?.price ?? "x"}-${index}`}>
          <span
            className="depth-bid"
            style={{ "--depth": `${(Number(row.bid?.quantity ?? 0) / max) * 100}%` } as React.CSSProperties}
          >
            {row.bid ? formatUnits(BigInt(row.bid.quantity), book.collateralDecimals) : "—"}
          </span>
          <b>
            {row.bid ? percent(row.bid.price, book.collateralDecimals) : "—"} /{" "}
            {row.ask ? percent(row.ask.price, book.collateralDecimals) : "—"}
          </b>
          <span
            className="depth-ask"
            style={{ "--depth": `${(Number(row.ask?.quantity ?? 0) / max) * 100}%` } as React.CSSProperties}
          >
            {row.ask ? formatUnits(BigInt(row.ask.quantity), book.collateralDecimals) : "—"}
          </span>
        </div>
      ))}
      <details className="accessible-data">
        <summary>How to read this depth</summary>
        <p>
          Bids are buyers waiting below the market. Asks are sellers available above it. EventRail walks asks
          from best to worst for an Up buy and computes the bound before your wallet opens.
        </p>
      </details>
    </div>
  );
}

export function RecentFills({
  fills,
  decimals,
}: Readonly<{ fills: readonly NormalizedFill[]; decimals: number }>) {
  const deferred = useDeferredValue(fills);
  return (
    <div className="recent-fills" aria-live="polite">
      {deferred.length === 0 ? (
        <div className="visual-empty">
          <strong>No fills in this window</strong>
          <span>Submitted IOC orders may return unfilled when price moves.</span>
        </div>
      ) : (
        deferred.slice(0, 12).map((fill) => (
          <a
            href={`https://shannon-explorer.somnia.network/tx/${fill.transactionHash}`}
            target="_blank"
            rel="noreferrer"
            className="fill-row"
            key={`${fill.transactionHash}-${fill.logIndex}`}
          >
            <span className={`fill-side fill-side--${fill.outcome}`}>
              {fill.side} {fill.outcome}
            </span>
            <b>{percent(fill.price, decimals)}</b>
            <span>{formatUnits(BigInt(fill.quantity), decimals)}</span>
            <time>{new Date(fill.timestamp).toLocaleTimeString()}</time>
          </a>
        ))
      )}
    </div>
  );
}

function percent(value: string, decimals: number) {
  return `${(Number(formatUnits(BigInt(value), decimals)) * 100).toFixed(1)}%`;
}
