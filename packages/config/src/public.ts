import { z } from "zod";
import { SOMNIA_NETWORKS } from "./network.js";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const PublicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SOMNIA_CHAIN_ID: z.coerce.number().int().positive().default(SOMNIA_NETWORKS.shannon.chainId),
  NEXT_PUBLIC_SOMNIA_RPC_URL: z.preprocess(emptyToUndefined, z.url().default(SOMNIA_NETWORKS.shannon.rpcUrl)),
  NEXT_PUBLIC_GATEWAY_URL: z.preprocess(emptyToUndefined, z.url().default("http://localhost:4000")),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

export type PublicEnvironment = z.infer<typeof PublicEnvironmentSchema>;

export function loadPublicEnvironment(input: Record<string, string | undefined>): PublicEnvironment {
  const result = PublicEnvironmentSchema.safeParse(input);
  if (!result.success) throw configurationError("public", result.error);
  if (result.data.NEXT_PUBLIC_SOMNIA_CHAIN_ID !== SOMNIA_NETWORKS.shannon.chainId) {
    throw new Error(
      `Invalid public configuration: NEXT_PUBLIC_SOMNIA_CHAIN_ID must be ${SOMNIA_NETWORKS.shannon.chainId} for the current release`,
    );
  }
  return result.data;
}

function configurationError(boundary: string, error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  return new Error(`Invalid ${boundary} configuration: ${details}`);
}
