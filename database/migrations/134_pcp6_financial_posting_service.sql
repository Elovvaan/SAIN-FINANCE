BEGIN;

CREATE TABLE IF NOT EXISTS financial_postings (
  posting_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  source_module TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  gl_batch_id UUID NOT NULL,
  gl_journal_entry_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  posted_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT financial_postings_batch_fk FOREIGN KEY (institution_key, gl_batch_id)
    REFERENCES gl_batches(institution_key, gl_batch_id) ON DELETE RESTRICT,
  CONSTRAINT financial_postings_entry_fk FOREIGN KEY (institution_key, gl_journal_entry_id)
    REFERENCES gl_journal_entries(institution_key, gl_journal_entry_id) ON DELETE RESTRICT,
  CONSTRAINT financial_postings_status_check CHECK (status IN ('DRAFT','POSTED','REVERSED','VOIDED')),
  CONSTRAINT financial_postings_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, idempotency_key),
  UNIQUE (institution_key, gl_journal_entry_id)
);

CREATE INDEX IF NOT EXISTS financial_postings_source_idx
  ON financial_postings (institution_key, source_module, source_reference, created_at DESC);

CREATE INDEX IF NOT EXISTS financial_postings_status_idx
  ON financial_postings (institution_key, status, created_at DESC);

CREATE OR REPLACE FUNCTION reject_posted_financial_posting_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('POSTED','REVERSED') AND NEW.status NOT IN ('REVERSED') THEN
    RAISE EXCEPTION 'FINANCIAL_POSTING_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_postings_reject_posted_update ON financial_postings;
CREATE TRIGGER financial_postings_reject_posted_update
BEFORE UPDATE ON financial_postings
FOR EACH ROW EXECUTE FUNCTION reject_posted_financial_posting_mutation();

COMMIT;
