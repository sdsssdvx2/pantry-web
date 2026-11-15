-- Per-client owner login throttling. Buckets are HMACed with OWNER_PASSWORD so
-- the database never stores raw client IP addresses for failed logins.

CREATE TABLE IF NOT EXISTS login_rate_limits (
  bucket TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS login_rate_limits_updated_idx
  ON login_rate_limits(updated_at);
