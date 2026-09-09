import {
  summarizeAnalytics,
  type AnalyticsEvent,
  type ApiKeyRecord,
  type ApiKeyStore,
  type EmbedConfig,
  type WebhookEventName,
} from "@eventrail/platform";
import type { DatabasePool } from "./pool.js";

export class PostgresIntegratorRepository implements ApiKeyStore {
  constructor(readonly pool: DatabasePool) {}

  async create(name: string, ownerAddress?: string): Promise<{ id: string; name: string }> {
    const id = crypto.randomUUID();
    const slug = `integrator-${id}`;
    await this.pool.query(
      "INSERT INTO integrators (id, slug, display_name, owner_address) VALUES ($1, $2, $3, $4)",
      [id, slug, name, ownerAddress ?? null],
    );
    return { id, name };
  }

  async findByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    const result = await this.pool.query<DbApiKey>(
      `SELECT id, integrator_id, label, kind, environment, prefix, secret_hash,
              allowed_origins, requests_per_minute, revoked_at, created_at
         FROM integrator_api_keys WHERE prefix = $1`,
      [prefix],
    );
    const row = result.rows[0];
    return row ? mapKey(row) : null;
  }

  async save(record: ApiKeyRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO integrator_api_keys
       (id, integrator_id, label, kind, environment, prefix, secret_hash, allowed_origins, requests_per_minute, revoked_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
      [
        record.id,
        record.integratorId,
        record.label,
        record.kind,
        record.environment,
        record.prefix,
        record.secretHash,
        JSON.stringify(record.allowedOrigins),
        record.requestsPerMinute,
        record.revokedAt,
        record.createdAt,
      ],
    );
  }

  async revoke(id: string, at: string): Promise<void> {
    await this.pool.query(
      "UPDATE integrator_api_keys SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL",
      [id, at],
    );
  }

  async listKeys(integratorId: string): Promise<Array<Omit<ApiKeyRecord, "secretHash">>> {
    const result = await this.pool.query<DbApiKey>(
      `SELECT id, integrator_id, label, kind, environment, prefix, secret_hash,
              allowed_origins, requests_per_minute, revoked_at, created_at
         FROM integrator_api_keys WHERE integrator_id = $1 ORDER BY created_at DESC`,
      [integratorId],
    );
    return result.rows.map((row) => {
      const { secretHash, ...key } = mapKey(row);
      void secretHash;
      return key;
    });
  }

  async saveConfig(integratorId: string, environment: "test" | "live", config: EmbedConfig): Promise<void> {
    await this.pool.query(
      `INSERT INTO integrator_configs (integrator_id, environment, config) VALUES ($1,$2,$3::jsonb)
       ON CONFLICT (integrator_id, environment) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`,
      [integratorId, environment, JSON.stringify(config)],
    );
  }

  async getConfig(integratorId: string, environment: "test" | "live"): Promise<unknown | null> {
    const result = await this.pool.query<{ config: unknown }>(
      "SELECT config FROM integrator_configs WHERE integrator_id = $1 AND environment = $2",
      [integratorId, environment],
    );
    return result.rows[0]?.config ?? null;
  }

  async audit(integratorId: string, actor: string, action: string, metadata: unknown = {}): Promise<void> {
    await this.pool.query(
      "INSERT INTO integrator_audit_events (id, integrator_id, actor, action, metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [crypto.randomUUID(), integratorId, actor, action, JSON.stringify(metadata)],
    );
  }

  async recordAnalytics(events: readonly AnalyticsEvent[]): Promise<number> {
    let accepted = 0;
    for (const event of events) {
      const result = await this.pool.query(
        `INSERT INTO integrator_analytics_events
         (id, integrator_id, environment, embed_id, event_name, market_id, transaction_hash, volume, occurred_at, expires_at)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,now()+make_interval(days => analytics_retention_days)
         FROM integrators WHERE id=$2
         ON CONFLICT DO NOTHING`,
        [
          event.id,
          event.integratorId,
          event.environment,
          event.embedId,
          event.name,
          event.marketId ?? null,
          event.transactionHash?.toLowerCase() ?? null,
          event.volume ?? null,
          event.occurredAt,
        ],
      );
      accepted += result.rowCount ?? 0;
    }
    return accepted;
  }

  async analytics(
    integratorId: string,
    environment: "test" | "live",
    from: string,
    to: string,
    filters: { embedId?: string; marketId?: string } = {},
  ) {
    const result = await this.pool.query<{
      id: string;
      integrator_id: string;
      environment: "test" | "live";
      embed_id: string;
      event_name: AnalyticsEvent["name"];
      market_id: string | null;
      transaction_hash: string | null;
      volume: string | null;
      occurred_at: Date;
    }>(
      `SELECT id, integrator_id, environment, embed_id, event_name, market_id, transaction_hash, volume, occurred_at
         FROM integrator_analytics_events WHERE integrator_id=$1 AND environment=$2
           AND occurred_at BETWEEN $3 AND $4
           AND ($5::text IS NULL OR embed_id=$5)
           AND ($6::text IS NULL OR lower(market_id)=lower($6))`,
      [integratorId, environment, from, to, filters.embedId ?? null, filters.marketId ?? null],
    );
    return summarizeAnalytics(
      result.rows.map((row) => ({
        id: row.id,
        integratorId: row.integrator_id,
        environment: row.environment,
        embedId: row.embed_id,
        name: row.event_name,
        ...(row.market_id ? { marketId: row.market_id } : {}),
        ...(row.transaction_hash ? { transactionHash: row.transaction_hash } : {}),
        ...(row.volume ? { volume: row.volume } : {}),
        occurredAt: row.occurred_at.toISOString(),
      })),
    );
  }

  async setAnalyticsRetention(integratorId: string, days: number): Promise<void> {
    await this.pool.query("UPDATE integrators SET analytics_retention_days=$2 WHERE id=$1", [
      integratorId,
      days,
    ]);
    await this.pool.query(
      "UPDATE integrator_analytics_events SET expires_at=LEAST(expires_at, now()+make_interval(days => $2)) WHERE integrator_id=$1",
      [integratorId, days],
    );
  }

  async createWebhook(integratorId: string, url: string, events: readonly WebhookEventName[]) {
    const endpoint = { id: crypto.randomUUID(), keyId: crypto.randomUUID() };
    await this.pool.query(
      `INSERT INTO webhook_endpoints (id, integrator_id, url, subscribed_events, active_key_id) VALUES ($1,$2,$3,$4::jsonb,$5)`,
      [endpoint.id, integratorId, url, JSON.stringify(events), endpoint.keyId],
    );
    return { ...endpoint, integratorId, url, events, enabled: true };
  }

  async listWebhooks(integratorId: string) {
    const result = await this.pool.query<{
      id: string;
      url: string;
      subscribed_events: WebhookEventName[];
      enabled: boolean;
      active_key_id: string;
    }>(
      "SELECT id,url,subscribed_events,enabled,active_key_id FROM webhook_endpoints WHERE integrator_id=$1 ORDER BY created_at",
      [integratorId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      url: row.url,
      events: row.subscribed_events,
      enabled: row.enabled,
      keyId: row.active_key_id,
    }));
  }

  async rotateWebhook(integratorId: string, endpointId: string) {
    const keyId = crypto.randomUUID();
    const result = await this.pool.query<{ active_key_id: string }>(
      `UPDATE webhook_endpoints SET previous_key_id=active_key_id,
         previous_key_expires_at=now()+interval '24 hours', active_key_id=$3
       WHERE id=$1 AND integrator_id=$2 RETURNING previous_key_id AS active_key_id`,
      [endpointId, integratorId, keyId],
    );
    return result.rows[0] ? { keyId, previousKeyId: result.rows[0].active_key_id } : null;
  }

  async replayWebhook(integratorId: string, deliveryId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE webhook_deliveries d SET status='retry', next_attempt_at=now() FROM webhook_endpoints e WHERE d.id=$1 AND d.endpoint_id=e.id AND e.integrator_id=$2 AND d.status='dead_letter'`,
      [deliveryId, integratorId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listWebhookDeliveries(integratorId: string, status?: string) {
    const result = await this.pool.query(
      `SELECT d.id,d.event_id,d.event_type,d.status,d.attempt_count,d.last_status_code,
              d.next_attempt_at,d.delivered_at,d.created_at,e.url
       FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id=d.endpoint_id
       WHERE e.integrator_id=$1 AND ($2::text IS NULL OR d.status=$2)
       ORDER BY d.created_at DESC LIMIT 250`,
      [integratorId, status ?? null],
    );
    return result.rows;
  }
}

interface DbApiKey {
  id: string;
  integrator_id: string;
  label: string;
  kind: "public" | "server";
  environment: "test" | "live";
  prefix: string;
  secret_hash: string;
  allowed_origins: string[];
  requests_per_minute: number;
  revoked_at: Date | string | null;
  created_at: Date | string;
}
function mapKey(row: DbApiKey): ApiKeyRecord {
  return {
    id: row.id,
    integratorId: row.integrator_id,
    label: row.label,
    kind: row.kind,
    environment: row.environment,
    prefix: row.prefix,
    secretHash: row.secret_hash,
    allowedOrigins: row.allowed_origins,
    requestsPerMinute: row.requests_per_minute,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
