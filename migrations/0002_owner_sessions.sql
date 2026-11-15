-- Revocable per-device owner sessions. The browser cookie contains a random
-- session id plus an HMAC proof derived from OWNER_PASSWORD; changing the
-- password therefore invalidates every existing session immediately.

CREATE TABLE IF NOT EXISTS owner_sessions (
  session_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS owner_sessions_device_idx
  ON owner_sessions(device_id, revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS owner_sessions_expiry_idx
  ON owner_sessions(expires_at);
