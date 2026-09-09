"use client";

import {
  Button,
  Card,
  DataTable,
  Field,
  Skeleton,
  Sparkline,
  StatusBadge,
  Tabs,
  useToast,
} from "@eventrail/react";
import { useState } from "react";

const tableRows = [
  { market: "Fed rate decision", probability: "64%", state: "Trading" },
  { market: "ETH above $5k", probability: "41%", state: "Resolving" },
];

export default function DesignSystemPage() {
  const [tab, setTab] = useState("primitives");
  const toast = useToast();
  return (
    <section className="design-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Foundation</span>
          <h1>EventRail design system</h1>
          <p>Production primitives shared by the trading app and embeddable SDK widgets.</p>
        </div>
        <StatusBadge tone="live">Interactive</StatusBadge>
      </header>
      <Tabs
        ariaLabel="Design system sections"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: "primitives",
            label: "Primitives",
            panel: (
              <div className="design-grid">
                <Card>
                  <h2>Actions</h2>
                  <div className="design-row">
                    <Button>Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button loading>Pending</Button>
                  </div>
                </Card>
                <Card>
                  <h2>Fields & status</h2>
                  <Field label="Trade amount" placeholder="25.00" hint="Enter an amount in USDso" />
                  <div className="design-row">
                    <StatusBadge tone="live">Live</StatusBadge>
                    <StatusBadge tone="warning">Resolving</StatusBadge>
                    <StatusBadge tone="danger">Stale</StatusBadge>
                  </div>
                </Card>
                <Card>
                  <h2>Feedback</h2>
                  <p>Toasts announce important state without interrupting a trade.</p>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      toast({
                        title: "Market updated",
                        message: "The latest DreamDEX price is ready.",
                        tone: "success",
                      })
                    }
                  >
                    Show toast
                  </Button>
                </Card>
                <Card>
                  <h2>Loading</h2>
                  <div className="design-stack">
                    <Skeleton width="60%" />
                    <Skeleton height="5rem" />
                    <Skeleton width="35%" />
                  </div>
                </Card>
              </div>
            ),
          },
          {
            id: "data",
            label: "Data display",
            panel: (
              <div className="design-grid">
                <Card>
                  <h2>Probability movement</h2>
                  <Sparkline
                    values={[21, 38, 32, 49, 44, 64]}
                    label="Probability increased from 21 to 64 percent"
                  />
                </Card>
                <Card className="design-card-wide">
                  <h2>Responsive table</h2>
                  <DataTable
                    caption="Example markets"
                    rows={tableRows}
                    rowKey={(row) => row.market}
                    empty="No markets"
                    columns={[
                      { key: "market", header: "Market", render: (row) => row.market },
                      { key: "probability", header: "Yes", render: (row) => row.probability },
                      {
                        key: "state",
                        header: "State",
                        render: (row) => (
                          <StatusBadge tone={row.state === "Trading" ? "live" : "warning"}>
                            {row.state}
                          </StatusBadge>
                        ),
                      },
                    ]}
                  />
                </Card>
              </div>
            ),
          },
          {
            id: "tokens",
            label: "Tokens",
            panel: (
              <div className="token-grid">
                {["bg", "surface", "surface-raised", "text", "muted", "accent", "danger", "warning"].map(
                  (token) => (
                    <Card key={token}>
                      <span className={`token-swatch token-swatch--${token}`} />
                      <code>--er-{token}</code>
                    </Card>
                  ),
                )}
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}
