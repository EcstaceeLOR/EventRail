export interface BuilderCapability {
  poolCapBpsTimes1k: bigint;
  userApprovalBpsTimes1k: bigint;
}
export interface BuilderAttribution {
  enabled: boolean;
  builder: `0x${string}`;
  feeBpsTimes1k: bigint;
  reason: "approved" | "disabled" | "unsupported" | "not_approved" | "above_cap";
}
const ZERO = "0x0000000000000000000000000000000000000000" as const;
export function resolveBuilderAttribution(input: {
  requested: boolean;
  builder?: `0x${string}`;
  feeBpsTimes1k?: bigint;
  capability?: BuilderCapability | null;
}): BuilderAttribution {
  const fee = input.feeBpsTimes1k ?? 0n;
  if (!input.requested || !input.builder || fee === 0n)
    return { enabled: false, builder: ZERO, feeBpsTimes1k: 0n, reason: "disabled" };
  if (!input.capability || input.capability.poolCapBpsTimes1k === 0n)
    return { enabled: false, builder: ZERO, feeBpsTimes1k: 0n, reason: "unsupported" };
  if (input.capability.userApprovalBpsTimes1k < fee)
    return { enabled: false, builder: ZERO, feeBpsTimes1k: 0n, reason: "not_approved" };
  if (input.capability.poolCapBpsTimes1k < fee)
    return { enabled: false, builder: ZERO, feeBpsTimes1k: 0n, reason: "above_cap" };
  return { enabled: true, builder: input.builder, feeBpsTimes1k: fee, reason: "approved" };
}
