CREATE TABLE IF NOT EXISTS trading_market (
  id INTEGER PRIMARY KEY CHECK (id=1),
  state JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS trading_positions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity>=0),
  cost_cents BIGINT NOT NULL CHECK (cost_cents>=0),
  PRIMARY KEY(user_id,symbol)
);
CREATE TABLE IF NOT EXISTS trading_orders (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS trading_orders_recent ON trading_orders(user_id,created_at DESC);
