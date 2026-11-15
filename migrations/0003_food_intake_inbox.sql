-- Sanitized Purchase Intelligence -> Food/Ingredient inbox.
-- Stores only the already validated food-intake v1 payload. Order/payment/
-- delivery/customer fields are rejected before this table is touched.

CREATE TABLE IF NOT EXISTS food_intake_inbox (
  id TEXT PRIMARY KEY,
  event_json TEXT NOT NULL,
  product_name TEXT NOT NULL,
  source_label TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','applied','dismissed')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS food_intake_inbox_status_received_idx
  ON food_intake_inbox(status, received_at DESC);

CREATE INDEX IF NOT EXISTS food_intake_inbox_product_status_idx
  ON food_intake_inbox(product_name, status, received_at DESC);
