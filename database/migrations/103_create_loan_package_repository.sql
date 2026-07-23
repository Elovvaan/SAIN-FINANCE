BEGIN;

CREATE TABLE IF NOT EXISTS loan_packages (
  loan_package_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  package_number TEXT NOT NULL,
  primary_customer_id UUID NOT NULL,
  assigned_operator_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  loan_type TEXT NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  requested_amount NUMERIC(18,2) NOT NULL,
  approved_amount NUMERIC(18,2),
  currency_code TEXT NOT NULL DEFAULT 'USD',
  interest_rate NUMERIC(9,6),
  term_months INTEGER,
  payment_frequency TEXT,
  payment_type TEXT,
  amortization_months INTEGER,
  balloon_payment BOOLEAN NOT NULL DEFAULT FALSE,
  origination_fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_costs NUMERIC(18,2) NOT NULL DEFAULT 0,
  risk_score NUMERIC(8,3),
  underwriting_notes TEXT,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  decisioned_at TIMESTAMPTZ,
  funded_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loan_packages_customer_fk FOREIGN KEY (institution_key, primary_customer_id)
    REFERENCES customer_profiles(institution_key, customer_id) ON DELETE RESTRICT,
  CONSTRAINT loan_packages_status_check CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','DECLINED','FUNDED','CLOSED')),
  CONSTRAINT loan_packages_type_check CHECK (loan_type IN ('REAL_ESTATE','VEHICLE','EQUIPMENT','BUSINESS','PERSONAL','LINE_OF_CREDIT','OTHER')),
  CONSTRAINT loan_packages_requested_amount_check CHECK (requested_amount > 0),
  CONSTRAINT loan_packages_approved_amount_check CHECK (approved_amount IS NULL OR approved_amount > 0),
  CONSTRAINT loan_packages_interest_rate_check CHECK (interest_rate IS NULL OR (interest_rate >= 0 AND interest_rate <= 100)),
  CONSTRAINT loan_packages_term_check CHECK (term_months IS NULL OR term_months > 0),
  CONSTRAINT loan_packages_amortization_check CHECK (amortization_months IS NULL OR amortization_months > 0),
  CONSTRAINT loan_packages_conditions_array CHECK (jsonb_typeof(conditions) = 'array'),
  CONSTRAINT loan_packages_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, loan_package_id),
  UNIQUE (institution_key, package_number)
);

CREATE TABLE IF NOT EXISTS loan_package_borrowers (
  loan_package_borrower_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  loan_package_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  borrower_role TEXT NOT NULL DEFAULT 'CO_BORROWER',
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loan_package_borrowers_package_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT loan_package_borrowers_customer_fk FOREIGN KEY (institution_key, customer_id)
    REFERENCES customer_profiles(institution_key, customer_id) ON DELETE RESTRICT,
  CONSTRAINT loan_package_borrowers_role_check CHECK (borrower_role IN ('PRIMARY','CO_BORROWER','GUARANTOR')),
  UNIQUE (institution_key, loan_package_id, customer_id, borrower_role)
);

CREATE TABLE IF NOT EXISTS loan_package_collateral (
  loan_package_collateral_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  loan_package_id UUID NOT NULL,
  collateral_id TEXT NOT NULL,
  pledged_value NUMERIC(18,2),
  lien_position INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loan_package_collateral_package_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT loan_package_collateral_asset_fk FOREIGN KEY (institution_key, collateral_id)
    REFERENCES filing_office_collateral(institution_key, collateral_id) ON DELETE RESTRICT,
  CONSTRAINT loan_package_collateral_status_check CHECK (status IN ('ACTIVE','RELEASED','LIQUIDATED')),
  UNIQUE (institution_key, loan_package_id, collateral_id)
);

CREATE TABLE IF NOT EXISTS loan_package_documents (
  loan_package_document_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  loan_package_id UUID NOT NULL,
  document_id UUID NOT NULL,
  document_role TEXT NOT NULL DEFAULT 'SUPPORTING',
  required BOOLEAN NOT NULL DEFAULT FALSE,
  frozen_version_id UUID REFERENCES repository_document_versions(document_version_id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loan_package_documents_package_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT loan_package_documents_document_fk FOREIGN KEY (document_id)
    REFERENCES repository_documents(document_id) ON DELETE RESTRICT,
  CONSTRAINT loan_package_documents_role_check CHECK (document_role IN ('APPLICATION','IDENTITY','INCOME','OWNERSHIP','VALUATION','TITLE','DISCLOSURE','CLOSING','SUPPORTING','OTHER')),
  UNIQUE (institution_key, loan_package_id, document_id, document_role)
);

CREATE TABLE IF NOT EXISTS loan_package_events (
  loan_package_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  loan_package_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  previous_status TEXT,
  resulting_status TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loan_package_events_package_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT loan_package_events_data_object CHECK (jsonb_typeof(event_data) = 'object')
);

CREATE INDEX IF NOT EXISTS loan_packages_institution_status_idx ON loan_packages (institution_key, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS loan_packages_customer_idx ON loan_packages (institution_key, primary_customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS loan_package_borrowers_package_idx ON loan_package_borrowers (institution_key, loan_package_id);
CREATE INDEX IF NOT EXISTS loan_package_collateral_package_idx ON loan_package_collateral (institution_key, loan_package_id);
CREATE INDEX IF NOT EXISTS loan_package_documents_package_idx ON loan_package_documents (institution_key, loan_package_id);
CREATE INDEX IF NOT EXISTS loan_package_events_package_idx ON loan_package_events (institution_key, loan_package_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_loan_package_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LOAN_PACKAGE_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS loan_package_events_reject_update ON loan_package_events;
CREATE TRIGGER loan_package_events_reject_update BEFORE UPDATE ON loan_package_events
FOR EACH ROW EXECUTE FUNCTION reject_loan_package_event_mutation();

DROP TRIGGER IF EXISTS loan_package_events_reject_delete ON loan_package_events;
CREATE TRIGGER loan_package_events_reject_delete BEFORE DELETE ON loan_package_events
FOR EACH ROW EXECUTE FUNCTION reject_loan_package_event_mutation();

COMMIT;