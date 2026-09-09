import type { Metadata } from "next";
import { FundingConsole } from "../../components/funding-console";

export const metadata: Metadata = { title: "Fund USDso" };

export default async function FundingPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ amount?: string; returnTo?: string }> }>) {
  const query = await searchParams;
  const returnTo =
    query.returnTo?.startsWith("/") && !query.returnTo.startsWith("//") ? query.returnTo : "/markets";
  return (
    <section className="section-wrap page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow">DreamDEX spot bridge</span>
          <h1>Fund USDso</h1>
          <p>A focused path from native Somnia liquidity to event-contract collateral.</p>
        </div>
      </div>
      <FundingConsole initialAmount={query.amount ?? "25"} returnTo={returnTo} />
    </section>
  );
}
