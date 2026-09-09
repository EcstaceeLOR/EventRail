import { createHmac, timingSafeEqual } from "node:crypto";
export type WebhookEventName = "fill.created" | "market.rolled-over" | "market.settled" | "claim.updated";
export interface WebhookEnvelope {
  id: string;
  type: WebhookEventName;
  createdAt: string;
  data: unknown;
}
export function deriveWebhookSecret(
  masterKey: string,
  integratorId: string,
  endpointId: string,
  keyId: string,
): string {
  if (masterKey.length < 16) throw new TypeError("Webhook master key must contain at least 16 characters.");
  return createHmac("sha256", masterKey).update(`${integratorId}:${endpointId}:${keyId}`).digest("base64url");
}
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}
export function verifyWebhook(
  secret: string,
  signature: string,
  body: string,
  nowSeconds: number,
  tolerance = 300,
): boolean {
  const fields = Object.fromEntries(signature.split(",").map((item) => item.split("=", 2)));
  const timestamp = Number(fields.t);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > tolerance || !fields.v1)
    return false;
  const expected = signWebhook(secret, timestamp, body).split("v1=")[1] ?? "";
  const left = Buffer.from(fields.v1);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
export interface WebhookAttempt {
  status: "delivered" | "retry" | "dead_letter";
  statusCode?: number;
  nextAttemptAt?: string;
}
export async function deliverWebhook(input: {
  url: string;
  secret: string;
  envelope: WebhookEnvelope;
  attempt: number;
  fetch?: typeof globalThis.fetch;
  now?: Date;
}): Promise<WebhookAttempt> {
  const body = JSON.stringify(input.envelope);
  const now = input.now ?? new Date();
  const response = await (input.fetch ?? globalThis.fetch)(input.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-eventrail-id": input.envelope.id,
      "x-eventrail-signature": signWebhook(input.secret, Math.floor(now.getTime() / 1_000), body),
    },
    body,
  });
  if (response.ok) return { status: "delivered", statusCode: response.status };
  if (input.attempt >= 8) return { status: "dead_letter", statusCode: response.status };
  return {
    status: "retry",
    statusCode: response.status,
    nextAttemptAt: new Date(now.getTime() + Math.min(3_600_000, 2 ** input.attempt * 1_000)).toISOString(),
  };
}
