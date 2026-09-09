"use client";

import { Button, Card, StatusBadge } from "@eventrail/react";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => console.error("EventRail route error", error), [error]);
  return (
    <section className="route-state route-error">
      <Card elevated>
        <StatusBadge tone="danger">Page unavailable</StatusBadge>
        <h1>This route hit a temporary problem.</h1>
        <p>Your wallet and funds are unaffected. Retry the request, or return to market discovery.</p>
        {error.digest ? <small>Reference: {error.digest}</small> : null}
        <div>
          <Button onClick={reset}>Try again</Button>
          <Button variant="ghost" onClick={() => window.location.assign("/markets")}>
            Browse markets
          </Button>
        </div>
      </Card>
    </section>
  );
}
