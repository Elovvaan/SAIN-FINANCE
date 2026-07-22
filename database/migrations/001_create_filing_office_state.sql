BEGIN;

CREATE TABLE IF NOT EXISTS filing_office_state (
  institution_key TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT filing_office_state_object CHECK (jsonb_typeof(state) = 'object')
);

CREATE INDEX IF NOT EXISTS filing_office_state_updated_at_idx
  ON filing_office_state (updated_at DESC);

COMMENT ON TABLE filing_office_state IS
  'Transitional aggregate store for SAIN Finance Filing Office state. Phase 2B will normalize entities behind the repository contract.';

COMMENT ON COLUMN filing_office_state.revision IS
  'Monotonic optimistic-concurrency revision incremented on every committed write.';

COMMIT;
