CREATE TABLE integrators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  external_id text NOT NULL,
  contract_address text CHECK (contract_address IS NULL OR contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  slug text NOT NULL,
  question text NOT NULL,
  category text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('trading', 'paused', 'resolving', 'resolved', 'voided')),
  yes_price numeric(20, 18) NOT NULL CHECK (yes_price BETWEEN 0 AND 1),
  no_price numeric(20, 18) NOT NULL CHECK (no_price BETWEEN 0 AND 1),
  volume_usd numeric(38, 18) NOT NULL DEFAULT 0 CHECK (volume_usd >= 0),
  liquidity_usd numeric(38, 18) NOT NULL DEFAULT 0 CHECK (liquidity_usd >= 0),
  closes_at timestamptz NOT NULL,
  source_block numeric(78, 0) NOT NULL CHECK (source_block >= 0),
  observed_at timestamptz NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, external_id),
  UNIQUE (network, slug)
);

CREATE TABLE outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  label text NOT NULL,
  side text NOT NULL CHECK (side IN ('yes', 'no', 'other')),
  last_price numeric(20, 18) CHECK (last_price BETWEEN 0 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, external_id),
  UNIQUE (market_id, side)
);

CREATE TABLE trades (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_number numeric(78, 0) NOT NULL CHECK (block_number >= 0),
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  outcome_id uuid NOT NULL REFERENCES outcomes(id) ON DELETE RESTRICT,
  trader_address text NOT NULL CHECK (trader_address ~ '^0x[0-9a-fA-F]{40}$'),
  direction text NOT NULL CHECK (direction IN ('buy', 'sell')),
  shares numeric(78, 18) NOT NULL CHECK (shares > 0),
  collateral_amount numeric(78, 18) NOT NULL CHECK (collateral_amount >= 0),
  price numeric(20, 18) NOT NULL CHECK (price BETWEEN 0 AND 1),
  traded_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, transaction_hash, log_index)
);

CREATE TABLE positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  wallet_address text NOT NULL CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  outcome_id uuid NOT NULL REFERENCES outcomes(id) ON DELETE RESTRICT,
  shares numeric(78, 18) NOT NULL DEFAULT 0 CHECK (shares >= 0),
  average_entry_price numeric(20, 18) CHECK (average_entry_price BETWEEN 0 AND 1),
  realized_pnl_usd numeric(78, 18) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, wallet_address, market_id, outcome_id)
);

CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL UNIQUE REFERENCES markets(id) ON DELETE RESTRICT,
  winning_outcome_id uuid REFERENCES outcomes(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'finalized', 'voided')),
  resolution_source text,
  transaction_hash text CHECK (transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  source_block numeric(78, 0) CHECK (source_block >= 0),
  resolved_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transaction_plans (
  id uuid PRIMARY KEY,
  plan_hash text NOT NULL UNIQUE CHECK (plan_hash ~ '^0x[0-9a-fA-F]{64}$'),
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  account_address text NOT NULL CHECK (account_address ~ '^0x[0-9a-fA-F]{40}$'),
  market_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  state text NOT NULL CHECK (state IN ('created', 'submitted', 'confirmed', 'expired', 'failed')),
  request jsonb NOT NULL,
  source_block numeric(78, 0) NOT NULL CHECK (source_block >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, key)
);

CREATE TABLE indexer_checkpoints (
  worker text NOT NULL,
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  block_number numeric(78, 0) NOT NULL CHECK (block_number >= 0),
  block_hash text CHECK (block_hash IS NULL OR block_hash ~ '^0x[0-9a-fA-F]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker, network)
);

CREATE TABLE chain_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_number numeric(78, 0) NOT NULL CHECK (block_number >= 0),
  event_name text NOT NULL,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, transaction_hash, log_index)
);

CREATE INDEX markets_discovery_idx ON markets (network, phase, closes_at);
CREATE INDEX markets_category_idx ON markets (network, category, volume_usd DESC);
CREATE INDEX trades_market_time_idx ON trades (market_id, traded_at DESC);
CREATE INDEX trades_trader_time_idx ON trades (network, trader_address, traded_at DESC);
CREATE INDEX positions_wallet_idx ON positions (network, wallet_address, updated_at DESC);
CREATE INDEX transaction_plans_expiry_idx ON transaction_plans (state, expires_at);
CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys (expires_at);
CREATE INDEX chain_events_market_lookup_idx ON chain_events ((payload ->> 'marketId'), block_number DESC);
CREATE INDEX chain_events_retention_idx ON chain_events (observed_at);
