-- Initial D1 schema for My Little Kitchen.
-- Existing production tables were originally created by runtime guards; every
-- statement is idempotent so this migration can safely register that schema.

CREATE TABLE IF NOT EXISTS owner_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  data TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS state_history (
  version INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  saved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_data TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  last_access_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS backup_snapshots (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT,
  data TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  backup_day TEXT
);

CREATE INDEX IF NOT EXISTS backup_snapshots_created_idx
  ON backup_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS access_devices (
  device_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  first_ip TEXT,
  last_ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  user_agent TEXT,
  trusted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS access_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  share_id TEXT,
  share_label TEXT,
  device_id TEXT,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS access_events_created_idx
  ON access_events(created_at DESC);

CREATE INDEX IF NOT EXISTS access_events_kind_idx
  ON access_events(kind, created_at DESC);
