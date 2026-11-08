CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY,
  resident_id TEXT NOT NULL REFERENCES residents(id),
  categories JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'acknowledged', 'completed', 'cancelled')),
  submission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resident_id, submission_key)
);
