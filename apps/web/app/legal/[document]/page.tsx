import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const documents = {
  risk: {
    title: "Risk disclosure",
    intro: "Event contracts are speculative and can lose their full purchase cost.",
    sections: [
      [
        "Execution",
        "Quotes expire quickly. Liquidity, fees, price impact, and Somnia state can change between review and block inclusion. Wallet simulation reduces risk but cannot guarantee execution.",
      ],
      [
        "Contracts and infrastructure",
        "DreamDEX contracts, Somnia, RPC providers, indexers, wallets, and EventRail may contain bugs or become unavailable. EventRail does not insure transactions or balances.",
      ],
      [
        "Resolution",
        "Oracle inputs may be delayed, disputed, incorrect, or produce a void. The deployed contract's finalized payout vector—not this interface—determines redemption value.",
      ],
    ],
  },
  privacy: {
    title: "Privacy and retention",
    intro: "EventRail minimizes collection and never asks for wallet signing secrets.",
    sections: [
      [
        "Collected data",
        "We may process public wallet addresses, transaction hashes, request correlation IDs, reliability telemetry, and integrator-scoped product events. Private keys, seed phrases, and raw wallet signatures are prohibited.",
      ],
      [
        "Purpose and retention",
        "Data supports requested functionality, abuse prevention, debugging, and aggregate adoption metrics. Integrator analytics default to 90 days and may be configured from 1 to 365 days.",
      ],
      [
        "Control",
        "An embedding application may collect data under its own policy. Contact its operator for those requests and the EventRail maintainers for EventRail operational data.",
      ],
    ],
  },
  responsible: {
    title: "Responsible trading",
    intro: "Prediction markets are information tools, not guaranteed income.",
    sections: [
      [
        "Set limits",
        "Use only funds you can afford to lose, avoid borrowing to trade, and stop when trading affects your wellbeing or obligations.",
      ],
      [
        "Check the market",
        "Read the exact question, expiry, oracle evidence, liquidity, price impact, and current immutable generation before signing.",
      ],
      [
        "No profit promise",
        "Probabilities and historical fills are not investment advice or a promise of future returns. EventRail does not recommend an outcome.",
      ],
    ],
  },
  terms: {
    title: "Terms of use",
    intro:
      "EventRail is experimental, non-custodial software provided without a profit or availability guarantee.",
    sections: [
      [
        "Your responsibility",
        "You control your wallet and decide whether to sign. You are responsible for understanding transactions, taxes, and whether event-contract trading is lawful where you are located.",
      ],
      [
        "No custody or advice",
        "EventRail prepares unsigned transaction requests. It does not hold assets, execute trades for you, provide investment advice, or guarantee an outcome.",
      ],
      [
        "Availability",
        "Features may change, pause, or be withdrawn for safety, maintenance, upstream incompatibility, or legal reasons. Open-source license terms remain separate.",
      ],
    ],
  },
} as const;

type DocumentKey = keyof typeof documents;

export function generateStaticParams() {
  return Object.keys(documents).map((document) => ({ document }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  const content = documents[document as DocumentKey];
  return content ? { title: content.title } : {};
}

export default async function LegalPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  const content = documents[document as DocumentKey];
  if (!content) notFound();
  return (
    <article className="section-wrap page-section legal-page">
      <span className="eyebrow">Trust center</span>
      <h1>{content.title}</h1>
      <p className="legal-intro">{content.intro}</p>
      {content.sections.map(([title, body]) => (
        <section key={title}>
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      ))}
      <p className="prototype-note">Last reviewed 9 September 2026. This content is not legal advice.</p>
      <Link href="/legal/responsible">Responsible-trading guidance →</Link>
    </article>
  );
}
