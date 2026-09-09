CREATE TABLE portfolio_positions (
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  account_address text NOT NULL CHECK (account_address ~ '^0x[0-9a-fA-F]{40}$'),
  market_id text NOT NULL CHECK (market_id ~ '^0x[0-9a-fA-F]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('up', 'down')),
  outcome_token_address text NOT NULL CHECK (outcome_token_address ~ '^0x[0-9a-fA-F]{40}$'),
  token_id numeric(78, 0) NOT NULL CHECK (token_id >= 0),
  source_block numeric(78, 0) NOT NULL CHECK (source_block >= 0),
  snapshot jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  observed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, account_address, market_id, outcome)
);

CREATE TABLE portfolio_scan_checkpoints (
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  account_address text NOT NULL CHECK (account_address ~ '^0x[0-9a-fA-F]{40}$'),
  source_block numeric(78, 0) NOT NULL CHECK (source_block >= 0),
  observed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, account_address)
);

CREATE TABLE redemption_records (
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  log_index integer NOT NULL CHECK (log_index >= 0),
  account_address text NOT NULL CHECK (account_address ~ '^0x[0-9a-fA-F]{40}$'),
  market_id text NOT NULL CHECK (market_id ~ '^0x[0-9a-fA-F]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('up', 'down')),
  amount numeric(78, 0) NOT NULL CHECK (amount > 0),
  payout numeric(78, 0) NOT NULL CHECK (payout >= 0),
  block_number numeric(78, 0) NOT NULL CHECK (block_number >= 0),
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (network, transaction_hash, log_index)
);

CREATE TABLE claim_candidates (
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  account_address text NOT NULL CHECK (account_address ~ '^0x[0-9a-fA-F]{40}$'),
  market_id text NOT NULL CHECK (market_id ~ '^0x[0-9a-fA-F]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('up', 'down')),
  status text NOT NULL CHECK (status IN ('claimable', 'no_value')),
  source_block numeric(78, 0) NOT NULL CHECK (source_block >= 0),
  candidate jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, account_address, market_id, outcome)
);

CREATE TABLE claim_scan_checkpoints (
  network text PRIMARY KEY CHECK (network IN ('shannon', 'mainnet')),
  page_offset integer NOT NULL CHECK (page_offset >= 0),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX portfolio_positions_account_idx
  ON portfolio_positions (network, account_address, active, observed_at DESC);
CREATE INDEX redemption_records_account_idx
  ON redemption_records (network, account_address, observed_at DESC);
CREATE INDEX claim_candidates_account_idx
  ON claim_candidates (network, account_address, status, observed_at DESC);
