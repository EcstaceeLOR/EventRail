import { Card, Skeleton } from "@eventrail/react";

export default function Loading() {
  return (
    <section className="route-state" aria-label="Loading page" aria-busy="true">
      <div>
        <Skeleton width="8rem" height="0.75rem" />
        <Skeleton width="min(34rem, 85%)" height="3.2rem" />
        <Skeleton width="min(42rem, 95%)" height="1rem" />
      </div>
      <div className="loading-grid">
        {[0, 1, 2].map((item) => (
          <Card key={item}>
            <Skeleton width="45%" />
            <Skeleton height="8rem" />
            <Skeleton width="70%" />
          </Card>
        ))}
      </div>
      <span className="er-visually-hidden">Loading EventRail data</span>
    </section>
  );
}
