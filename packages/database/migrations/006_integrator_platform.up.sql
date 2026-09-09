CREATE TABLE integrators (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  owner_address text,
  analytics_retention_days integer NOT NULL DEFAULT 90 CHECK (analytics_retention_days BETWEEN 1 AND 365),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integrator_api_keys (
  id uuid PRIMARY KEY,
  integrator_id uuid NOT NULL REFERENCES integrators(id) ON DELETE CASCADE,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('public', 'server')),
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  prefix text NOT NULL UNIQUE,
  secret_hash text NOT NULL CHECK (char_length(secret_hash) = 64),
  allowed_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
  requests_per_minute integer NOT NULL DEFAULT 120 CHECK (requests_per_minute > 0),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'server' OR jsonb_array_length(allowed_origins) > 0)
);

CREATE TABLE integrator_configs (
  integrator_id uuid NOT NULL REFERENCES integrators(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (integrator_id, environment)
);

CREATE TABLE integrator_audit_events (
  id uuid PRIMARY KEY,
  integrator_id uuid NOT NULL REFERENCES integrators(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integrator_analytics_events (
  id text NOT NULL,
  integrator_id uuid NOT NULL REFERENCES integrators(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  embed_id text NOT NULL,
  event_name text NOT NULL CHECK (event_name IN ('impression','wallet_connected','quote_created','wallet_signature_requested','transaction_submitted','trade_filled','funding_completed','claim_completed','market_rolled_over')),
  market_id text,
  transaction_hash text,
  volume numeric(78, 0),
  occurred_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  PRIMARY KEY (integrator_id, id)
);
CREATE UNIQUE INDEX integrator_analytics_chain_dedupe
  ON integrator_analytics_events (integrator_id, event_name, lower(transaction_hash))
  WHERE transaction_hash IS NOT NULL;
CREATE INDEX integrator_analytics_filter_idx
  ON integrator_analytics_events (integrator_id, environment, embed_id, occurred_at DESC);

CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY,
  integrator_id uuid NOT NULL REFERENCES integrators(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^https://'),
  subscribed_events jsonb NOT NULL,
  active_key_id uuid NOT NULL,
  previous_key_id uuid,
  previous_key_expires_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY,
  endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('pending', 'retry', 'delivered', 'dead_letter')),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status_code integer,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, event_id)
);
CREATE INDEX webhook_delivery_queue_idx ON webhook_deliveries (status, next_attempt_at);

CREATE TABLE builder_attribution_receipts (
  transaction_hash text PRIMARY KEY CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  integrator_id uuid REFERENCES integrators(id) ON DELETE SET NULL,
  market_id text NOT NULL,
  builder_address text NOT NULL CHECK (builder_address ~ '^0x[0-9a-fA-F]{40}$'),
  fee_bps_times_1k numeric(78, 0) NOT NULL CHECK (fee_bps_times_1k >= 0),
  fee_amount numeric(78, 0),
  attribution_status text NOT NULL CHECK (attribution_status IN ('tagged', 'untagged_fallback')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Deliberately no plaintext API or webhook secret column exists. Webhook secrets
-- are derived from a deployment master key plus the stored key identifiers.
