import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export type ApiEnvironment = "test" | "live";
export type ApiKeyKind = "public" | "server";
export interface ApiKeyRecord {
  id: string;
  integratorId: string;
  label: string;
  kind: ApiKeyKind;
  environment: ApiEnvironment;
  prefix: string;
  secretHash: string;
  allowedOrigins: readonly string[];
  requestsPerMinute: number;
  revokedAt: string | null;
  createdAt: string;
}
export interface ApiKeyStore {
  findByPrefix(prefix: string): Promise<ApiKeyRecord | null>;
  save(record: ApiKeyRecord): Promise<void>;
  revoke(id: string, at: string): Promise<void>;
}
export class InMemoryApiKeyStore implements ApiKeyStore {
  readonly #records = new Map<string, ApiKeyRecord>();
  async findByPrefix(prefix: string) {
    return this.#records.get(prefix) ?? null;
  }
  async save(record: ApiKeyRecord) {
    this.#records.set(record.prefix, record);
  }
  async revoke(id: string, at: string) {
    for (const [prefix, record] of this.#records)
      if (record.id === id) this.#records.set(prefix, { ...record, revokedAt: at });
  }
}
export class ApiAccessError extends Error {
  constructor(
    readonly code: "INVALID_KEY" | "REVOKED_KEY" | "ORIGIN_DENIED" | "ENVIRONMENT_MISMATCH" | "RATE_LIMITED",
    message: string,
    readonly status: 401 | 403 | 429,
  ) {
    super(message);
    this.name = "ApiAccessError";
  }
}
export interface IssuedApiKey {
  token: string;
  key: Omit<ApiKeyRecord, "secretHash">;
}
export class ApiAccessService {
  readonly #usage = new Map<string, { minute: number; count: number }>();
  constructor(
    readonly store: ApiKeyStore,
    readonly pepper: string,
    readonly clock: () => Date = () => new Date(),
  ) {
    if (pepper.length < 16) throw new TypeError("API key pepper must contain at least 16 characters.");
  }
  async issue(input: {
    integratorId: string;
    label: string;
    kind: ApiKeyKind;
    environment: ApiEnvironment;
    allowedOrigins?: readonly string[];
    requestsPerMinute?: number;
  }): Promise<IssuedApiKey> {
    const id = randomUUID();
    const prefix = `er_${input.kind === "public" ? "pk" : "sk"}_${input.environment}_${randomBytes(5).toString("hex")}`;
    const token = `${prefix}.${randomBytes(24).toString("base64url")}`;
    const allowedOrigins = normalizeOrigins(input.allowedOrigins ?? []);
    if (input.kind === "public" && allowedOrigins.length === 0)
      throw new TypeError("Browser keys require at least one allowed origin.");
    const record: ApiKeyRecord = {
      id,
      integratorId: input.integratorId,
      label: input.label,
      kind: input.kind,
      environment: input.environment,
      prefix,
      secretHash: hashToken(token, this.pepper),
      allowedOrigins,
      requestsPerMinute: input.requestsPerMinute ?? 120,
      revokedAt: null,
      createdAt: this.clock().toISOString(),
    };
    await this.store.save(record);
    return { token, key: withoutHash(record) };
  }
  async authenticate(input: {
    token?: string;
    origin?: string;
    environment: ApiEnvironment;
    endpoint?: string;
  }): Promise<ApiKeyRecord> {
    const token = input.token ?? "";
    const prefix = token.split(".", 1)[0] ?? "";
    const record = prefix ? await this.store.findByPrefix(prefix) : null;
    if (!record || !safeEqual(record.secretHash, hashToken(token, this.pepper)))
      throw new ApiAccessError("INVALID_KEY", "The API key is invalid.", 401);
    if (record.revokedAt) throw new ApiAccessError("REVOKED_KEY", "The API key has been revoked.", 401);
    if (record.environment !== input.environment)
      throw new ApiAccessError("ENVIRONMENT_MISMATCH", "The API key belongs to another environment.", 403);
    if (
      record.kind === "public" &&
      (!input.origin || !record.allowedOrigins.includes(normalizeOrigin(input.origin)))
    )
      throw new ApiAccessError("ORIGIN_DENIED", "This origin is not allowed for the browser API key.", 403);
    const minute = Math.floor(this.clock().getTime() / 60_000);
    const quotaKey = `${record.id}:${input.endpoint ?? "all"}`;
    const usage = this.#usage.get(quotaKey);
    const next = usage?.minute === minute ? { minute, count: usage.count + 1 } : { minute, count: 1 };
    this.#usage.set(quotaKey, next);
    if (next.count > record.requestsPerMinute)
      throw new ApiAccessError("RATE_LIMITED", "The API key quota has been exceeded.", 429);
    return record;
  }
}
export function extractBearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice(7) : undefined;
}
function hashToken(token: string, pepper: string) {
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}
function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function normalizeOrigins(origins: readonly string[]) {
  return [...new Set(origins.map(normalizeOrigin))];
}
function normalizeOrigin(origin: string) {
  const url = new URL(origin);
  if (!/^https?:$/.test(url.protocol)) throw new TypeError("Allowed origins must use HTTP or HTTPS.");
  return url.origin;
}
function withoutHash(record: ApiKeyRecord): Omit<ApiKeyRecord, "secretHash"> {
  const { secretHash, ...safe } = record;
  void secretHash;
  return safe;
}
