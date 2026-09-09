import type { Metadata } from "next";
import { MarketWorkspace } from "../../../components/market-workspace";
import { markets } from "../../../lib/markets";

interface MarketPageProps {
  params: Promise<{ marketId: string }>;
}

export async function generateMetadata({ params }: MarketPageProps): Promise<Metadata> {
  const { marketId } = await params;
  const fallback = markets.find((item) => item.id === marketId);
  return { title: fallback?.question ?? `DreamDEX market ${marketId.slice(0, 10)}` };
}

export default async function MarketDetailPage({ params }: MarketPageProps) {
  const { marketId } = await params;
  return <MarketWorkspace marketId={marketId} fallback={markets.find((item) => item.id === marketId)} />;
}
