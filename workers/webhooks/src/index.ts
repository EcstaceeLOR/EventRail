import { deliverWebhook, deriveWebhookSecret, type WebhookEnvelope } from "@eventrail/platform";

export interface PendingDelivery {
  id: string;
  endpointId: string;
  integratorId: string;
  url: string;
  activeKeyId: string;
  envelope: WebhookEnvelope;
  attempt: number;
}
export interface WebhookDeliveryRepository {
  claim(limit: number): Promise<readonly PendingDelivery[]>;
  delivered(id: string, statusCode: number): Promise<void>;
  retry(id: string, statusCode: number, at: string): Promise<void>;
  deadLetter(id: string, statusCode: number): Promise<void>;
}
export class WebhookDispatcher {
  constructor(
    readonly repository: WebhookDeliveryRepository,
    readonly masterKey: string,
    readonly fetch: typeof globalThis.fetch = globalThis.fetch,
  ) {}
  async runBatch(limit = 50): Promise<{ delivered: number; retried: number; deadLettered: number }> {
    const result = { delivered: 0, retried: 0, deadLettered: 0 };
    for (const job of await this.repository.claim(limit)) {
      const secret = deriveWebhookSecret(this.masterKey, job.integratorId, job.endpointId, job.activeKeyId);
      const attempt = await deliverWebhook({
        url: job.url,
        secret,
        envelope: job.envelope,
        attempt: job.attempt,
        fetch: this.fetch,
      });
      if (attempt.status === "delivered") {
        await this.repository.delivered(job.id, attempt.statusCode ?? 200);
        result.delivered++;
      } else if (attempt.status === "retry") {
        await this.repository.retry(
          job.id,
          attempt.statusCode ?? 500,
          attempt.nextAttemptAt ?? new Date().toISOString(),
        );
        result.retried++;
      } else {
        await this.repository.deadLetter(job.id, attempt.statusCode ?? 500);
        result.deadLettered++;
      }
    }
    return result;
  }
}
