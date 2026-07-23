BEGIN;

CREATE TABLE IF NOT EXISTS servicing_loans (
  servicing_loan_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  loan_package_id UUID NOT NULL,
  account_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  delinquency_status TEXT NOT NULL DEFAULT 'CURRENT',
  original_principal NUMERIC(20,2) NOT NULL,
  principal_balance NUMERIC(20,2) NOT NULL,
  annual_interest_rate NUMERIC(12,8) NOT NULL,
  payment_frequency TEXT NOT NULL DEFAULT 'MONTHLY',
  term_months INTEGER NOT NULL,
  amortization_months INTEGER NOT NULL,
  origination_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  first_payment_date DATE NOT NULL,
  next_due_date DATE NOT NULL,
  next_payment_amount NUMERIC(20,2) NOT NULL,
  escrow_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  unapplied_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  late_fee_balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  interest_due NUMERIC(20,2) NOT NULL DEFAULT 0,
  principal_due NUMERIC(20,2) NOT NULL DEFAULT 0,
  days_past_due INTEGER NOT NULL DEFAULT 0,
  last_payment_at TIMESTAMPTZ,
  last_accrual_date DATE,
  boarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_off_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT servicing_loans_package_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT servicing_loans_status_check CHECK (status IN ('ACTIVE','PAID_OFF','CHARGED_OFF','DEFAULT','SUSPENDED','CANCELLED')),
  CONSTRAINT servicing_loans_delinquency_check CHECK (delinquency_status IN ('CURRENT','DPD_1_29','DPD_30','DPD_60','DPD_90','DEFAULT','LOSS_MITIGATION','FORECLOSURE','RECOVERY')),
  CONSTRAINT servicing_loans_frequency_check CHECK (payment_frequency IN ('WEEKLY','BIWEEKLY','SEMIMONTHLY','MONTHLY','QUARTERLY','ANNUALLY')),
  CONSTRAINT servicing_loans_amounts_check CHECK (original_principal >= 0 AND principal_balance >= 0 AND escrow_balance >= 0 AND unapplied_balance >= 0 AND late_fee_balance >= 0 AND interest_due >= 0 AND principal_due >= 0),
  CONSTRAINT servicing_loans_rate_check CHECK (annual_interest_rate >= 0),
  CONSTRAINT servicing_loans_term_check CHECK (term_months > 0 AND amortization_months > 0),
  CONSTRAINT servicing_loans_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, servicing_loan_id),
  UNIQUE (institution_key, loan_package_id),
  UNIQUE (institution_key, account_number)
);

CREATE TABLE IF NOT EXISTS servicing_payment_schedule (
  schedule_item_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  servicing_loan_id UUID NOT NULL,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  scheduled_payment NUMERIC(20,2) NOT NULL,
  scheduled_principal NUMERIC(20,2) NOT NULL,
  scheduled_interest NUMERIC(20,2) NOT NULL,
  scheduled_escrow NUMERIC(20,2) NOT NULL DEFAULT 0,
  remaining_principal NUMERIC(20,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT servicing_schedule_loan_fk FOREIGN KEY (institution_key, servicing_loan_id)
    REFERENCES servicing_loans(institution_key, servicing_loan_id) ON DELETE RESTRICT,
  CONSTRAINT servicing_schedule_status_check CHECK (status IN ('SCHEDULED','PARTIALLY_PAID','PAID','SKIPPED','RESTRUCTURED')),
  CONSTRAINT servicing_schedule_amounts_check CHECK (scheduled_payment >= 0 AND scheduled_principal >= 0 AND scheduled_interest >= 0 AND scheduled_escrow >= 0 AND remaining_principal >= 0),
  UNIQUE (institution_key, servicing_loan_id, installment_number)
);

CREATE TABLE IF NOT EXISTS servicing_payments (
  servicing_payment_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  servicing_loan_id UUID NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'REGULAR',
  status TEXT NOT NULL DEFAULT 'POSTED',
  amount NUMERIC(20,2) NOT NULL,
  principal_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  escrow_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  late_fee_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  unapplied_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  effective_date DATE NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  external_reference TEXT,
  reversal_of_payment_id UUID,
  notes TEXT,
  posted_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT servicing_payments_loan_fk FOREIGN KEY (institution_key, servicing_loan_id)
    REFERENCES servicing_loans(institution_key, servicing_loan_id) ON DELETE RESTRICT,
  CONSTRAINT servicing_payments_reversal_fk FOREIGN KEY (reversal_of_payment_id)
    REFERENCES servicing_payments(servicing_payment_id) ON DELETE RESTRICT,
  CONSTRAINT servicing_payments_type_check CHECK (payment_type IN ('REGULAR','PARTIAL','EXTRA_PRINCIPAL','INTEREST_ONLY','ESCROW_ONLY','PAYOFF','REVERSAL','RETURNED','CORRECTION')),
  CONSTRAINT servicing_payments_status_check CHECK (status IN ('PENDING','POSTED','RETURNED','REVERSED','FAILED')),
  CONSTRAINT servicing_payments_amounts_check CHECK (amount >= 0 AND principal_amount >= 0 AND interest_amount >= 0 AND escrow_amount >= 0 AND late_fee_amount >= 0 AND unapplied_amount >= 0)
);

CREATE TABLE IF NOT EXISTS servicing_escrow_items (
  escrow_item_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  servicing_loan_id UUID NOT NULL,
  escrow_type TEXT NOT NULL,
  payee_name TEXT,
  annual_amount NUMERIC(20,2) NOT NULL,
  monthly_amount NUMERIC(20,2) NOT NULL,
  next_disbursement_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT servicing_escrow_loan_fk FOREIGN KEY (institution_key, servicing_loan_id)
    REFERENCES servicing_loans(institution_key, servicing_loan_id) ON DELETE RESTRICT,
  CONSTRAINT servicing_escrow_type_check CHECK (escrow_type IN ('PROPERTY_TAX','HOMEOWNERS_INSURANCE','FLOOD_INSURANCE','PMI','HOA','OTHER')),
  CONSTRAINT servicing_escrow_status_check CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  CONSTRAINT servicing_escrow_amounts_check CHECK (annual_amount >= 0 AND monthly_amount >= 0)
);

CREATE TABLE IF NOT EXISTS servicing_events (
  servicing_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  servicing_loan_id UUID NOT NULL,
  loan_package_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT servicing_events_loan_fk FOREIGN KEY (institution_key, servicing_loan_id)
    REFERENCES servicing_loans(institution_key, servicing_loan_id) ON DELETE RESTRICT,
  CONSTRAINT servicing_events_package_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT servicing_events_data_object CHECK (jsonb_typeof(event_data) = 'object')
);

CREATE INDEX IF NOT EXISTS servicing_loans_queue_idx ON servicing_loans (institution_key, status, delinquency_status, next_due_date);
CREATE INDEX IF NOT EXISTS servicing_loans_package_idx ON servicing_loans (institution_key, loan_package_id);
CREATE INDEX IF NOT EXISTS servicing_schedule_due_idx ON servicing_payment_schedule (institution_key, servicing_loan_id, due_date, status);
CREATE INDEX IF NOT EXISTS servicing_payments_loan_idx ON servicing_payments (institution_key, servicing_loan_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS servicing_escrow_loan_idx ON servicing_escrow_items (institution_key, servicing_loan_id, status);
CREATE INDEX IF NOT EXISTS servicing_events_loan_idx ON servicing_events (institution_key, servicing_loan_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_servicing_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SERVICING_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS servicing_events_reject_update ON servicing_events;
CREATE TRIGGER servicing_events_reject_update BEFORE UPDATE ON servicing_events
FOR EACH ROW EXECUTE FUNCTION reject_servicing_event_mutation();

DROP TRIGGER IF EXISTS servicing_events_reject_delete ON servicing_events;
CREATE TRIGGER servicing_events_reject_delete BEFORE DELETE ON servicing_events
FOR EACH ROW EXECUTE FUNCTION reject_servicing_event_mutation();

COMMIT;