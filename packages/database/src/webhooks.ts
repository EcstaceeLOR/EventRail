import type { WebhookEnvelope } from "@eventrail/platform";
import type { DatabasePool } from "./pool.js";

export class PostgresWebhookDeliveryRepository {
  constructor(readonly pool: DatabasePool) {}

  async enqueue(integratorId: string, envelope: WebhookEnvelope): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO webhook_deliveries (id, endpoint_id, event_id, event_type, payload, status)
       SELECT gen_random_uuid(), id, $2, $3, $4::jsonb, 'pending'
       FROM webhook_endpoints
       WHERE integrator_id=$1 AND enabled=true AND subscribed_events ? $3
       ON CONFLICT (endpoint_id, event_id) DO NOTHING`,
      [integratorId, envelope.id, envelope.type, JSON.stringify(envelope)],
    );
    return result.rowCount ?? 0;
  }

  async claim(limit: number) {
    const result = await this.pool.query<DeliveryRow>(
      `WITH picked AS (
         SELECT d.id FROM webhook_deliveries d
         WHERE d.status IN ('pending','retry') AND d.next_attempt_at <= now()
         ORDER BY d.next_attempt_at, d.created_at FOR UPDATE SKIP LOCKED LIMIT $1
       )
       UPDATE webhook_deliveries d SET attempt_count=d.attempt_count+1
       FROM picked p, webhook_endpoints e
       WHERE d.id=p.id AND d.endpoint_id=e.id
       RETURNING d.id, d.endpoint_id, e.integrator_id, e.url, e.active_key_id,
                 d.payload, d.attempt_count`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      endpointId: row.endpoint_id,
      integratorId: row.integrator_id,
      url: row.url,
      activeKeyId: row.active_key_id,
      envelope: row.payload,
      attempt: row.attempt_count,
    }));
  }

  async delivered(id: string, statusCode: number) {
    await this.pool.query(
      "UPDATE webhook_deliveries SET status='delivered', last_status_code=$2, delivered_at=now() WHERE id=$1",
      [id, statusCode],
    );
  }
  async retry(id: string, statusCode: number, at: string) {
    await this.pool.query(
      "UPDATE webhook_deliveries SET status='retry', last_status_code=$2, next_attempt_at=$3 WHERE id=$1",
      [id, statusCode, at],
    );
  }
  async deadLetter(id: string, statusCode: number) {
    await this.pool.query(
      "UPDATE webhook_deliveries SET status='dead_letter', last_status_code=$2 WHERE id=$1",
      [id, statusCode],
    );
  }
}

interface DeliveryRow {
  id: string;
  endpoint_id: string;
  integrator_id: string;
  url: string;
  active_key_id: string;
  payload: WebhookEnvelope;
  attempt_count: number;
}
