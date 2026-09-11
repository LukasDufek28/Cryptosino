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
