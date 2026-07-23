BEGIN;

CREATE TABLE IF NOT EXISTS gl_accounts (
  gl_account_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  normal_balance TEXT NOT NULL,
  parent_account_id UUID,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  allow_manual_posting BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT gl_accounts_parent_fk FOREIGN KEY (institution_key, parent_account_id)
    REFERENCES gl_accounts(institution_key, gl_account_id) ON DELETE RESTRICT,
  CONSTRAINT gl_accounts_type_check CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
  CONSTRAINT gl_accounts_normal_check CHECK (normal_balance IN ('DEBIT','CREDIT')),
  CONSTRAINT gl_accounts_status_check CHECK (status IN ('ACTIVE','INACTIVE','CLOSED')),
  CONSTRAINT gl_accounts_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, gl_account_id),
  UNIQUE (institution_key, account_number)
);

CREATE TABLE IF NOT EXISTS gl_batches (
  gl_batch_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  source_module TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  accounting_date DATE NOT NULL,
  description TEXT,
  posted_at TIMESTAMPTZ,
  posted_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gl_batches_status_check CHECK (status IN ('OPEN','POSTED','VOIDED')),
  UNIQUE (institution_key, gl_batch_id),
  UNIQUE (institution_key, batch_number)
);

CREATE TABLE IF NOT EXISTS gl_journal_entries (
  gl_journal_entry_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  gl_batch_id UUID,
  journal_number TEXT NOT NULL,
  source_module TEXT NOT NULL,
  source_reference TEXT,
  accounting_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  description TEXT NOT NULL,
  reversal_of_entry_id UUID,
  posted_at TIMESTAMPTZ,
  posted_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT gl_entries_batch_fk FOREIGN KEY (institution_key, gl_batch_id)
    REFERENCES gl_batches(institution_key, gl_batch_id) ON DELETE RESTRICT,
  CONSTRAINT gl_entries_reversal_fk FOREIGN KEY (institution_key, reversal_of_entry_id)
    REFERENCES gl_journal_entries(institution_key, gl_journal_entry_id) ON DELETE RESTRICT,
  CONSTRAINT gl_entries_status_check CHECK (status IN ('DRAFT','POSTED','REVERSED','VOIDED')),
  CONSTRAINT gl_entries_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, gl_journal_entry_id),
  UNIQUE (institution_key, journal_number)
);

CREATE TABLE IF NOT EXISTS gl_journal_lines (
  gl_journal_line_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  gl_journal_entry_id UUID NOT NULL,
  gl_account_id UUID NOT NULL,
  line_number INTEGER NOT NULL,
  debit_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  description TEXT,
  customer_id UUID,
  loan_package_id UUID,
  servicing_loan_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gl_lines_entry_fk FOREIGN KEY (institution_key, gl_journal_entry_id)
    REFERENCES gl_journal_entries(institution_key, gl_journal_entry_id) ON DELETE RESTRICT,
  CONSTRAINT gl_lines_account_fk FOREIGN KEY (institution_key, gl_account_id)
    REFERENCES gl_accounts(institution_key, gl_account_id) ON DELETE RESTRICT,
  CONSTRAINT gl_lines_customer_fk FOREIGN KEY (institution_key, customer_id)
    REFERENCES customer_profiles(institution_key, customer_id) ON DELETE RESTRICT,
  CONSTRAINT gl_lines_loan_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT gl_lines_servicing_fk FOREIGN KEY (institution_key, servicing_loan_id)
    REFERENCES servicing_loans(institution_key, servicing_loan_id) ON DELETE RESTRICT,
  CONSTRAINT gl_lines_amount_check CHECK (
    debit_amount >= 0 AND credit_amount >= 0 AND
    ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
  ),
  UNIQUE (institution_key, gl_journal_entry_id, line_number)
);

CREATE TABLE IF NOT EXISTS gl_account_balances (
  gl_account_balance_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  gl_account_id UUID NOT NULL,
  accounting_date DATE NOT NULL,
  debit_total NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit_total NUMERIC(20,2) NOT NULL DEFAULT 0,
  ending_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gl_balances_account_fk FOREIGN KEY (institution_key, gl_account_id)
    REFERENCES gl_accounts(institution_key, gl_account_id) ON DELETE RESTRICT,
  UNIQUE (institution_key, gl_account_id, accounting_date)
);

CREATE TABLE IF NOT EXISTS gl_events (
  gl_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  gl_journal_entry_id UUID,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gl_events_entry_fk FOREIGN KEY (institution_key, gl_journal_entry_id)
    REFERENCES gl_journal_entries(institution_key, gl_journal_entry_id) ON DELETE RESTRICT,
  CONSTRAINT gl_events_data_object CHECK (jsonb_typeof(event_data) = 'object')
);

CREATE INDEX IF NOT EXISTS gl_accounts_lookup_idx ON gl_accounts (institution_key, status, account_number);
CREATE INDEX IF NOT EXISTS gl_entries_queue_idx ON gl_journal_entries (institution_key, status, accounting_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS gl_entries_source_idx ON gl_journal_entries (institution_key, source_module, source_reference);
CREATE INDEX IF NOT EXISTS gl_lines_account_idx ON gl_journal_lines (institution_key, gl_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gl_balances_date_idx ON gl_account_balances (institution_key, accounting_date DESC);
CREATE INDEX IF NOT EXISTS gl_events_entry_idx ON gl_events (institution_key, gl_journal_entry_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_posted_gl_entry_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('POSTED','REVERSED') THEN
    RAISE EXCEPTION 'GL_POSTED_ENTRY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gl_entries_reject_posted_update ON gl_journal_entries;
CREATE TRIGGER gl_entries_reject_posted_update BEFORE UPDATE ON gl_journal_entries
FOR EACH ROW EXECUTE FUNCTION reject_posted_gl_entry_mutation();

CREATE OR REPLACE FUNCTION reject_posted_gl_line_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE entry_status TEXT;
BEGIN
  SELECT status INTO entry_status FROM gl_journal_entries
  WHERE institution_key=OLD.institution_key AND gl_journal_entry_id=OLD.gl_journal_entry_id;
  IF entry_status IN ('POSTED','REVERSED') THEN
    RAISE EXCEPTION 'GL_POSTED_LINES_IMMUTABLE';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gl_lines_reject_posted_update ON gl_journal_lines;
CREATE TRIGGER gl_lines_reject_posted_update BEFORE UPDATE OR DELETE ON gl_journal_lines
FOR EACH ROW EXECUTE FUNCTION reject_posted_gl_line_mutation();

CREATE OR REPLACE FUNCTION reject_gl_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GL_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS gl_events_reject_update ON gl_events;
CREATE TRIGGER gl_events_reject_update BEFORE UPDATE ON gl_events
FOR EACH ROW EXECUTE FUNCTION reject_gl_event_mutation();
DROP TRIGGER IF EXISTS gl_events_reject_delete ON gl_events;
CREATE TRIGGER gl_events_reject_delete BEFORE DELETE ON gl_events
FOR EACH ROW EXECUTE FUNCTION reject_gl_event_mutation();

COMMIT;