-- Basic schema for Cryptosino
-- Idempotent creation (only creates if not exists)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance NUMERIC(18,2) NOT NULL DEFAULT 1000.00,
  -- Track highest balance user has ever reached
  peak_balance NUMERIC(18,2) NOT NULL DEFAULT 1000.00,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL, -- 'dice' | 'crash' | 'blackjack'
  wager NUMERIC(18,2) NOT NULL,
  payout NUMERIC(18,2) NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Simple index
CREATE INDEX IF NOT EXISTS idx_bets_user_created ON bets(user_id, created_at DESC);

-- Sessions (JWT-less optional fallback). For now just reserved.
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Helper: ensure pgcrypto or uuid extension for gen_random_uuid
DO $$ BEGIN
  PERFORM 1 FROM pg_extension WHERE extname='pgcrypto';
  IF NOT FOUND THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END $$;

-- Post-creation safeguard if running against an existing database missing peak_balance
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='peak_balance'
  ) THEN
    ALTER TABLE users ADD COLUMN peak_balance NUMERIC(18,2) NOT NULL DEFAULT 1000.00;
    -- Initialize peak_balance to current balance if higher than default
    UPDATE users SET peak_balance = GREATEST(balance, 1000.00);
  END IF;
END $$;

-- Post-creation safeguard for is_admin column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='is_admin'
  ) THEN
    ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Post-creation safeguard for is_owner column (single true owner allowed by app logic)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='is_owner'
  ) THEN
    ALTER TABLE users ADD COLUMN is_owner BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
