import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, DataTable, Field, Sparkline, StatusBadge } from "../dist/index.js";

test("button exposes its busy state and remains labelled", () => {
  const output = renderToStaticMarkup(createElement(Button, { loading: true }, "Submit trade"));
  assert.match(output, /aria-busy="true"/);
  assert.match(output, /Submit trade/);
  assert.match(output, /disabled/);
});

test("field connects its error to the input", () => {
  const output = renderToStaticMarkup(createElement(Field, { label: "Amount", error: "Required" }));
  assert.match(output, /aria-invalid="true"/);
  assert.match(output, /Required/);
});

test("table, chart, and status primitives keep accessible labels", () => {
  const table = renderToStaticMarkup(
    createElement(DataTable, {
      caption: "Open positions",
      columns: [{ key: "name", header: "Market", render: (row) => row.name }],
      rows: [{ id: "1", name: "Demo market" }],
      rowKey: (row) => row.id,
      empty: "No positions",
    }),
  );
  assert.match(table, /Open positions/);
  assert.match(table, /Demo market/);
  assert.match(
    renderToStaticMarkup(createElement(Sparkline, { values: [1, 3, 2], label: "Price history" })),
    /Price history/,
  );
  assert.match(renderToStaticMarkup(createElement(StatusBadge, { tone: "live" }, "Live")), /Live/);
});
