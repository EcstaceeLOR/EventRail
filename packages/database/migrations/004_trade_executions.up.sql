CREATE TABLE trade_executions (
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  plan_id uuid NOT NULL REFERENCES trade_plans(plan_id) ON DELETE RESTRICT,
  plan_hash text NOT NULL CHECK (plan_hash ~ '^0x[0-9a-fA-F]{64}$'),
  account_address text NOT NULL CHECK (account_address ~ '^0x[0-9a-fA-F]{40}$'),
  market_id text NOT NULL CHECK (market_id ~ '^0x[0-9a-fA-F]{64}$'),
  pool_address text NOT NULL CHECK (pool_address ~ '^0x[0-9a-fA-F]{40}$'),
  state text NOT NULL CHECK (state IN ('submitted', 'confirmed', 'filled', 'partially_filled', 'unfilled', 'reverted')),
  requested_quantity numeric(78, 0) NOT NULL CHECK (requested_quantity > 0),
  filled_quantity numeric(78, 0) NOT NULL DEFAULT 0 CHECK (filled_quantity >= 0),
  realized_quote_quantity numeric(78, 0) NOT NULL DEFAULT 0 CHECK (realized_quote_quantity >= 0),
  realized_average_price numeric(78, 0) CHECK (realized_average_price >= 0),
  block_number numeric(78, 0) CHECK (block_number >= 0),
  error_code text,
  observed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, transaction_hash),
  UNIQUE (plan_id)
);

CREATE TABLE trade_execution_fills (
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  log_index integer NOT NULL CHECK (log_index >= 0),
  plan_id uuid NOT NULL REFERENCES trade_plans(plan_id) ON DELETE RESTRICT,
  market_id text NOT NULL CHECK (market_id ~ '^0x[0-9a-fA-F]{64}$'),
  pool_address text NOT NULL CHECK (pool_address ~ '^0x[0-9a-fA-F]{40}$'),
  outcome text NOT NULL CHECK (outcome IN ('up', 'down')),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  price numeric(78, 0) NOT NULL CHECK (price >= 0),
  quantity numeric(78, 0) NOT NULL CHECK (quantity > 0),
  quote_quantity numeric(78, 0) NOT NULL CHECK (quote_quantity >= 0),
  block_number numeric(78, 0) NOT NULL CHECK (block_number >= 0),
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (network, transaction_hash, log_index)
);

CREATE INDEX trade_execution_fills_plan_idx ON trade_execution_fills (plan_id, log_index);
CREATE INDEX trade_executions_account_idx ON trade_executions (network, account_address, observed_at DESC);
