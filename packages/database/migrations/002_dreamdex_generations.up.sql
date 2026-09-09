CREATE TABLE dreamdex_market_generations (
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  market_id text NOT NULL CHECK (market_id ~ '^0x[0-9a-fA-F]{64}$'),
  series_key text NOT NULL,
  pool_address text NOT NULL CHECK (pool_address ~ '^0x[0-9a-fA-F]{40}$'),
  pool_nonce numeric(78, 0) NOT NULL CHECK (pool_nonce >= 0),
  status text NOT NULL CHECK (status IN ('listed', 'trading', 'locked', 'settling', 'resolved', 'voided')),
  source_block numeric(78, 0) NOT NULL CHECK (source_block >= 0),
  trading_start timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  snapshot jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, market_id)
);

CREATE TABLE dreamdex_series_heads (
  network text NOT NULL CHECK (network IN ('shannon', 'mainnet')),
  series_key text NOT NULL,
  market_id text NOT NULL,
  source_block numeric(78, 0) NOT NULL CHECK (source_block >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, series_key),
  FOREIGN KEY (network, market_id) REFERENCES dreamdex_market_generations(network, market_id) ON DELETE RESTRICT
);

CREATE INDEX dreamdex_generations_series_idx
  ON dreamdex_market_generations (network, series_key, trading_start DESC);
CREATE INDEX dreamdex_generations_status_idx
  ON dreamdex_market_generations (network, status, expires_at);
