CREATE TABLE trade_plans (
  plan_id uuid PRIMARY KEY,
  plan_hash text NOT NULL UNIQUE CHECK (plan_hash ~ '^0x[0-9a-fA-F]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^0x[0-9a-fA-F]{64}$'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  chain_id integer NOT NULL CHECK (chain_id > 0),
  account_address text NOT NULL CHECK (account_address ~ '^0x[0-9a-fA-F]{40}$'),
  market_id text NOT NULL CHECK (market_id ~ '^0x[0-9a-fA-F]{64}$'),
  pool_address text NOT NULL CHECK (pool_address ~ '^0x[0-9a-fA-F]{40}$'),
  state text NOT NULL DEFAULT 'planned' CHECK (
    state IN (
      'planned', 'wallet_pending', 'submitted', 'confirmed', 'filled',
      'partially_filled', 'unfilled', 'reverted', 'expired', 'invalidated'
    )
  ),
  plan jsonb NOT NULL,
  transaction_hash text CHECK (transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  source_block numeric(78, 0) NOT NULL CHECK (source_block >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, account_address, idempotency_key)
);

CREATE INDEX trade_plans_account_activity_idx
  ON trade_plans (network, account_address, created_at DESC);
CREATE INDEX trade_plans_market_activity_idx
  ON trade_plans (network, market_id, created_at DESC);
CREATE INDEX trade_plans_pending_idx
  ON trade_plans (state, expires_at)
  WHERE state IN ('planned', 'wallet_pending', 'submitted', 'confirmed');
