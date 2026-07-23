BEGIN;

CREATE TABLE IF NOT EXISTS compliance_profiles (
  compliance_profile_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  customer_id UUID NOT NULL,
  cip_status TEXT NOT NULL DEFAULT 'PENDING',
  kyc_status TEXT NOT NULL DEFAULT 'PENDING',
  risk_rating TEXT NOT NULL DEFAULT 'MEDIUM',
  customer_type TEXT NOT NULL DEFAULT 'INDIVIDUAL',
  beneficial_ownership_required BOOLEAN NOT NULL DEFAULT FALSE,
  sanctions_status TEXT NOT NULL DEFAULT 'NOT_SCREENED',
  pep_status TEXT NOT NULL DEFAULT 'NOT_SCREENED',
  next_review_date DATE,
  last_reviewed_at TIMESTAMPTZ,
  last_reviewed_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT compliance_profiles_customer_fk FOREIGN KEY (institution_key, customer_id)
    REFERENCES customer_profiles(institution_key, customer_id) ON DELETE RESTRICT,
  CONSTRAINT compliance_profiles_cip_check CHECK (cip_status IN ('PENDING','VERIFIED','FAILED','EXPIRED')),
  CONSTRAINT compliance_profiles_kyc_check CHECK (kyc_status IN ('PENDING','VERIFIED','ENHANCED_DUE_DILIGENCE','FAILED','EXPIRED')),
  CONSTRAINT compliance_profiles_risk_check CHECK (risk_rating IN ('LOW','MEDIUM','HIGH','PROHIBITED')),
  CONSTRAINT compliance_profiles_customer_type_check CHECK (customer_type IN ('INDIVIDUAL','BUSINESS','TRUST','NONPROFIT','GOVERNMENT')),
  CONSTRAINT compliance_profiles_sanctions_check CHECK (sanctions_status IN ('NOT_SCREENED','CLEAR','POTENTIAL_MATCH','CONFIRMED_MATCH')),
  CONSTRAINT compliance_profiles_pep_check CHECK (pep_status IN ('NOT_SCREENED','CLEAR','POTENTIAL_MATCH','CONFIRMED_MATCH')),
  CONSTRAINT compliance_profiles_metadata_object CHECK (jsonb_typeof(metadata)='object'),
  UNIQUE (institution_key, compliance_profile_id),
  UNIQUE (institution_key, customer_id)
);

CREATE TABLE IF NOT EXISTS beneficial_owners (
  beneficial_owner_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  compliance_profile_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  ownership_percent NUMERIC(7,4),
  control_person BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status TEXT NOT NULL DEFAULT 'PENDING',
  identification_type TEXT,
  identification_last_four TEXT,
  country_code TEXT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT beneficial_owners_profile_fk FOREIGN KEY (institution_key, compliance_profile_id)
    REFERENCES compliance_profiles(institution_key, compliance_profile_id) ON DELETE RESTRICT,
  CONSTRAINT beneficial_owners_percent_check CHECK (ownership_percent IS NULL OR (ownership_percent >= 0 AND ownership_percent <= 100)),
  CONSTRAINT beneficial_owners_verification_check CHECK (verification_status IN ('PENDING','VERIFIED','FAILED','EXPIRED')),
  UNIQUE (institution_key, beneficial_owner_id)
);

CREATE TABLE IF NOT EXISTS aml_alerts (
  aml_alert_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  alert_number TEXT NOT NULL,
  customer_id UUID,
  treasury_payment_id UUID,
  servicing_loan_id UUID,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  summary TEXT NOT NULL,
  assigned_to TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  disposition TEXT,
  disposition_notes TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT aml_alerts_customer_fk FOREIGN KEY (institution_key, customer_id)
    REFERENCES customer_profiles(institution_key, customer_id) ON DELETE RESTRICT,
  CONSTRAINT aml_alerts_payment_fk FOREIGN KEY (institution_key, treasury_payment_id)
    REFERENCES treasury_payments(institution_key, treasury_payment_id) ON DELETE RESTRICT,
  CONSTRAINT aml_alerts_servicing_fk FOREIGN KEY (institution_key, servicing_loan_id)
    REFERENCES servicing_loans(institution_key, servicing_loan_id) ON DELETE RESTRICT,
  CONSTRAINT aml_alerts_severity_check CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT aml_alerts_status_check CHECK (status IN ('OPEN','IN_REVIEW','ESCALATED','CLOSED','DISMISSED')),
  CONSTRAINT aml_alerts_score_check CHECK (score >= 0 AND score <= 100),
  CONSTRAINT aml_alerts_metadata_object CHECK (jsonb_typeof(metadata)='object'),
  UNIQUE (institution_key, aml_alert_id),
  UNIQUE (institution_key, alert_number)
);

CREATE TABLE IF NOT EXISTS compliance_cases (
  compliance_case_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  case_number TEXT NOT NULL,
  customer_id UUID,
  case_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  regulatory_filing_required BOOLEAN NOT NULL DEFAULT FALSE,
  regulatory_filing_type TEXT,
  due_date DATE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT compliance_cases_customer_fk FOREIGN KEY (institution_key, customer_id)
    REFERENCES customer_profiles(institution_key, customer_id) ON DELETE RESTRICT,
  CONSTRAINT compliance_cases_status_check CHECK (status IN ('OPEN','IN_REVIEW','AWAITING_INFORMATION','ESCALATED','CLOSED')),
  CONSTRAINT compliance_cases_priority_check CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT compliance_cases_metadata_object CHECK (jsonb_typeof(metadata)='object'),
  UNIQUE (institution_key, compliance_case_id),
  UNIQUE (institution_key, case_number)
);

CREATE TABLE IF NOT EXISTS compliance_case_alerts (
  institution_key TEXT NOT NULL,
  compliance_case_id UUID NOT NULL,
  aml_alert_id UUID NOT NULL,
  linked_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compliance_case_alerts_case_fk FOREIGN KEY (institution_key, compliance_case_id)
    REFERENCES compliance_cases(institution_key, compliance_case_id) ON DELETE RESTRICT,
  CONSTRAINT compliance_case_alerts_alert_fk FOREIGN KEY (institution_key, aml_alert_id)
    REFERENCES aml_alerts(institution_key, aml_alert_id) ON DELETE RESTRICT,
  PRIMARY KEY (institution_key, compliance_case_id, aml_alert_id)
);

CREATE TABLE IF NOT EXISTS enterprise_risk_items (
  risk_item_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  risk_number TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  likelihood INTEGER NOT NULL,
  impact INTEGER NOT NULL,
  inherent_score INTEGER NOT NULL,
  residual_score INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  owner_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  mitigation_plan TEXT,
  review_date DATE,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enterprise_risk_score_check CHECK (likelihood BETWEEN 1 AND 5 AND impact BETWEEN 1 AND 5 AND inherent_score BETWEEN 1 AND 25 AND residual_score BETWEEN 1 AND 25),
  CONSTRAINT enterprise_risk_status_check CHECK (status IN ('OPEN','MITIGATING','ACCEPTED','CLOSED')),
  UNIQUE (institution_key, risk_item_id),
  UNIQUE (institution_key, risk_number)
);

CREATE TABLE IF NOT EXISTS compliance_events (
  compliance_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  compliance_profile_id UUID,
  aml_alert_id UUID,
  compliance_case_id UUID,
  risk_item_id UUID,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  previous_status TEXT,
  resulting_status TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compliance_events_profile_fk FOREIGN KEY (institution_key, compliance_profile_id)
    REFERENCES compliance_profiles(institution_key, compliance_profile_id) ON DELETE RESTRICT,
  CONSTRAINT compliance_events_alert_fk FOREIGN KEY (institution_key, aml_alert_id)
    REFERENCES aml_alerts(institution_key, aml_alert_id) ON DELETE RESTRICT,
  CONSTRAINT compliance_events_case_fk FOREIGN KEY (institution_key, compliance_case_id)
    REFERENCES compliance_cases(institution_key, compliance_case_id) ON DELETE RESTRICT,
  CONSTRAINT compliance_events_risk_fk FOREIGN KEY (institution_key, risk_item_id)
    REFERENCES enterprise_risk_items(institution_key, risk_item_id) ON DELETE RESTRICT,
  CONSTRAINT compliance_events_data_object CHECK (jsonb_typeof(event_data)='object')
);

CREATE INDEX IF NOT EXISTS compliance_profiles_review_idx ON compliance_profiles (institution_key, risk_rating, next_review_date);
CREATE INDEX IF NOT EXISTS aml_alerts_queue_idx ON aml_alerts (institution_key, status, severity, opened_at DESC);
CREATE INDEX IF NOT EXISTS compliance_cases_queue_idx ON compliance_cases (institution_key, status, priority, due_date);
CREATE INDEX IF NOT EXISTS enterprise_risk_queue_idx ON enterprise_risk_items (institution_key, status, residual_score DESC);
CREATE INDEX IF NOT EXISTS compliance_events_idx ON compliance_events (institution_key, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_compliance_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMPLIANCE_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS compliance_events_reject_update ON compliance_events;
CREATE TRIGGER compliance_events_reject_update BEFORE UPDATE ON compliance_events
FOR EACH ROW EXECUTE FUNCTION reject_compliance_event_mutation();
DROP TRIGGER IF EXISTS compliance_events_reject_delete ON compliance_events;
CREATE TRIGGER compliance_events_reject_delete BEFORE DELETE ON compliance_events
FOR EACH ROW EXECUTE FUNCTION reject_compliance_event_mutation();

COMMIT;