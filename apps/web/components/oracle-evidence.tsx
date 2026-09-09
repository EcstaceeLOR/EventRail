import type { MarketResolution, OracleEvidence } from "@eventrail/types";

export function OracleEvidencePanel({
  marketId,
  resolution,
  evidence,
  compact = false,
}: Readonly<{
  marketId: string;
  resolution: MarketResolution;
  evidence: OracleEvidence | null;
  compact?: boolean;
}>) {
  const content = (
    <div className="oracle-evidence-grid">
      <div>
        <span>Decision</span>
        <strong>
          {resolution.state === "voided"
            ? "Voided · 0.5 payout per outcome"
            : resolution.state === "resolved"
              ? `${resolution.winningOutcome?.toUpperCase()} won`
              : "Awaiting oracle"}
        </strong>
      </div>
      <div>
        <span>Opening</span>
        <strong>{evidence?.openingValue ?? resolution.openingPrice ?? "Unavailable"}</strong>
      </div>
      <div>
        <span>Closing</span>
        <strong>{evidence?.closingValue ?? resolution.resolutionPrice ?? "Unavailable"}</strong>
      </div>
      <div>
        <span>Question IDs</span>
        <code>{evidence?.closingQuestionId ?? evidence?.openingQuestionId ?? "Unavailable"}</code>
      </div>
      <div className="oracle-evidence-id">
        <span>Exact market ID</span>
        <code>{marketId}</code>
      </div>
      <div className="oracle-evidence-links">
        {evidence?.explorerUrl ? (
          <a href={evidence.explorerUrl} target="_blank" rel="noreferrer">
            Resolution transaction ↗
          </a>
        ) : (
          <span>On-chain evidence link unavailable</span>
        )}
        {evidence?.graphUrl ? (
          <a href={evidence.graphUrl} target="_blank" rel="noreferrer">
            Oracle graph ↗
          </a>
        ) : (
          <span>Oracle graph unavailable</span>
        )}
      </div>
    </div>
  );
  if (!compact) return <section className="oracle-evidence">{content}</section>;
  return (
    <details className="oracle-evidence oracle-evidence--compact">
      <summary>Oracle evidence</summary>
      {content}
    </details>
  );
}
