BEGIN;

CREATE TABLE IF NOT EXISTS treasury_accounts (
  treasury_account_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  gl_account_id UUID NOT NULL,
  available_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  ledger_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  minimum_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT treasury_accounts_gl_fk FOREIGN KEY (institution_key, gl_account_id)
    REFERENCES gl_accounts(institution_key, gl_account_id) ON DELETE RESTRICT,
  CONSTRAINT treasury_accounts_type_check CHECK (account_type IN ('OPERATING','SETTLEMENT','ESCROW','CLEARING','SUSPENSE','RESERVE')),
  CONSTRAINT treasury_accounts_status_check CHECK (status IN ('ACTIVE','RESTRICTED','INACTIVE','CLOSED')),
  CONSTRAINT treasury_accounts_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, treasury_account_id),
  UNIQUE (institution_key, account_number)
);

CREATE TABLE IF NOT EXISTS treasury_payments (
  treasury_payment_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  payment_number TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  amount NUMERIC(20,2) NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  source_treasury_account_id UUID,
  destination_treasury_account_id UUID,
  beneficiary_name TEXT,
  beneficiary_reference TEXT,
  external_reference TEXT,
  requested_execution_date DATE NOT NULL,
  authorized_at TIMESTAMPTZ,
  authorized_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  released_at TIMESTAMPTZ,
  released_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  settled_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  return_reason TEXT,
  gl_journal_entry_id UUID,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT treasury_payments_source_fk FOREIGN KEY (institution_key, source_treasury_account_id)
    REFERENCES treasury_accounts(institution_key, treasury_account_id) ON DELETE RESTRICT,
  CONSTRAINT treasury_payments_destination_fk FOREIGN KEY (institution_key, destination_treasury_account_id)
    REFERENCES treasury_accounts(institution_key, treasury_account_id) ON DELETE RESTRICT,
  CONSTRAINT treasury_payments_gl_fk FOREIGN KEY (institution_key, gl_journal_entry_id)
    REFERENCES gl_journal_entries(institution_key, gl_journal_entry_id) ON DELETE RESTRICT,
  CONSTRAINT treasury_payments_type_check CHECK (payment_type IN ('INTERNAL_TRANSFER','WIRE','ACH','CASHIERS_CHECK','ESCROW_DISBURSEMENT','CONSTRUCTION_DRAW')),
  CONSTRAINT treasury_payments_direction_check CHECK (direction IN ('INBOUND','OUTBOUND','INTERNAL')),
  CONSTRAINT treasury_payments_status_check CHECK (status IN ('DRAFT','PENDING_AUTHORIZATION','AUTHORIZED','RELEASED','SETTLED','RETURNED','CANCELLED','REVERSED')),
  CONSTRAINT treasury_payments_amount_check CHECK (amount > 0),
  CONSTRAINT treasury_payments_accounts_check CHECK (source_treasury_account_id IS NOT NULL OR destination_treasury_account_id IS NOT NULL),
  CONSTRAINT treasury_payments_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, treasury_payment_id),
  UNIQUE (institution_key, payment_number)
);

CREATE TABLE IF NOT EXISTS treasury_events (
  treasury_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  treasury_payment_id UUID,
  treasury_account_id UUID,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  previous_status TEXT,
  resulting_status TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT treasury_events_payment_fk FOREIGN KEY (institution_key, treasury_payment_id)
    REFERENCES treasury_payments(institution_key, treasury_payment_id) ON DELETE RESTRICT,
  CONSTRAINT treasury_events_account_fk FOREIGN KEY (institution_key, treasury_account_id)
    REFERENCES treasury_accounts(institution_key, treasury_account_id) ON DELETE RESTRICT,
  CONSTRAINT treasury_events_data_object CHECK (jsonb_typeof(event_data) = 'object')
);

CREATE INDEX IF NOT EXISTS treasury_accounts_position_idx ON treasury_accounts (institution_key, status, account_type, currency_code);
CREATE INDEX IF NOT EXISTS treasury_payments_queue_idx ON treasury_payments (institution_key, status, requested_execution_date, created_at DESC);
CREATE INDEX IF NOT EXISTS treasury_payments_reference_idx ON treasury_payments (institution_key, external_reference, beneficiary_reference);
CREATE INDEX IF NOT EXISTS treasury_events_payment_idx ON treasury_events (institution_key, treasury_payment_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_treasury_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TREASURY_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS treasury_events_reject_update ON treasury_events;
CREATE TRIGGER treasury_events_reject_update BEFORE UPDATE ON treasury_events
FOR EACH ROW EXECUTE FUNCTION reject_treasury_event_mutation();
DROP TRIGGER IF EXISTS treasury_events_reject_delete ON treasury_events;
CREATE TRIGGER treasury_events_reject_delete BEFORE DELETE ON treasury_events
FOR EACH ROW EXECUTE FUNCTION reject_treasury_event_mutation();

COMMIT;