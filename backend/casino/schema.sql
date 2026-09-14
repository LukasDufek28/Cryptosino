-- Apply explicitly with npm run migrate:casino --workspace=backend.
-- Presence is independent of balances, bets, and game settlement.
CREATE TABLE IF NOT EXISTS casino_presence (
  room_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  yaw REAL NOT NULL DEFAULT 0,
  seat_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS casino_one_guest_per_seat
  ON casino_presence (room_id, seat_id) WHERE seat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS casino_presence_expiry ON casino_presence (updated_at);
-- Safe to re-run for existing rooms; only appearance metadata is added.
ALTER TABLE casino_presence ADD COLUMN IF NOT EXISTS face_seed INTEGER NOT NULL DEFAULT 0;

-- WebRTC control plane only. No high-frequency movement is stored here.
CREATE TABLE IF NOT EXISTS casino_browser_rooms (
  room_id TEXT PRIMARY KEY,
  host_session UUID,
  generation INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS casino_browser_members (
  session_id UUID PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES casino_browser_rooms(room_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_version TEXT NOT NULL DEFAULT 'unknown',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);
-- Safe to re-run when patch reporting is added to an existing browser room.
ALTER TABLE casino_browser_members ADD COLUMN IF NOT EXISTS client_version TEXT NOT NULL DEFAULT 'unknown';
CREATE TABLE IF NOT EXISTS casino_browser_signals (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES casino_browser_rooms(room_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  sender UUID NOT NULL REFERENCES casino_browser_members(session_id) ON DELETE CASCADE,
  recipient UUID NOT NULL REFERENCES casino_browser_members(session_id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sender, message_id)
);
CREATE INDEX IF NOT EXISTS casino_browser_signal_inbox ON casino_browser_signals(recipient, id);

CREATE TABLE IF NOT EXISTS casino_slot_machines (
  machine_id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID,
  lease_until TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  spin_ends_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_spin JSONB
);
CREATE TABLE IF NOT EXISTS casino_slot_requests (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, request_id)
);
