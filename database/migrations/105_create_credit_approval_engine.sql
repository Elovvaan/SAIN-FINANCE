BEGIN;

CREATE TABLE IF NOT EXISTS credit_decisions (
  credit_decision_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  underwriting_case_id UUID NOT NULL,
  loan_package_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  decision_type TEXT,
  requested_amount NUMERIC(20,2) NOT NULL,
  approved_amount NUMERIC(20,2),
  currency_code TEXT NOT NULL DEFAULT 'USD',
  authority_level TEXT NOT NULL DEFAULT 'MANAGER',
  committee_required BOOLEAN NOT NULL DEFAULT FALSE,
  exception_requested BOOLEAN NOT NULL DEFAULT FALSE,
  exception_reason TEXT,
  final_conditions TEXT,
  decided_at TIMESTAMPTZ,
  decided_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT credit_decisions_case_fk FOREIGN KEY (institution_key, underwriting_case_id)
    REFERENCES underwriting_cases(institution_key, underwriting_case_id) ON DELETE RESTRICT,
  CONSTRAINT credit_decisions_package_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT credit_decisions_status_check CHECK (status IN ('PENDING','IN_REVIEW','APPROVED','CONDITIONAL_APPROVAL','DECLINED','RETURNED','CANCELLED')),
  CONSTRAINT credit_decisions_type_check CHECK (decision_type IS NULL OR decision_type IN ('APPROVE','CONDITIONAL_APPROVAL','DECLINE','RETURN_FOR_INFORMATION')),
  CONSTRAINT credit_decisions_authority_check CHECK (authority_level IN ('LOAN_OFFICER','MANAGER','SENIOR_MANAGER','COMMITTEE')),
  CONSTRAINT credit_decisions_amount_check CHECK (requested_amount >= 0 AND (approved_amount IS NULL OR approved_amount >= 0)),
  CONSTRAINT credit_decisions_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, credit_decision_id),
  UNIQUE (institution_key, underwriting_case_id)
);

CREATE TABLE IF NOT EXISTS credit_approvals (
  credit_approval_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  credit_decision_id UUID NOT NULL,
  approver_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  approval_level TEXT NOT NULL,
  vote TEXT NOT NULL,
  comments TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_method TEXT NOT NULL DEFAULT 'OPERATOR_SESSION',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_approvals_decision_fk FOREIGN KEY (institution_key, credit_decision_id)
    REFERENCES credit_decisions(institution_key, credit_decision_id) ON DELETE RESTRICT,
  CONSTRAINT credit_approvals_level_check CHECK (approval_level IN ('LOAN_OFFICER','MANAGER','SENIOR_MANAGER','COMMITTEE')),
  CONSTRAINT credit_approvals_vote_check CHECK (vote IN ('APPROVE','CONDITIONAL_APPROVAL','DECLINE','RETURN_FOR_INFORMATION')),
  CONSTRAINT credit_approvals_signature_check CHECK (signature_method IN ('OPERATOR_SESSION','DIGITAL_SIGNATURE','WET_SIGNATURE_VERIFIED')),
  UNIQUE (institution_key, credit_decision_id, approver_user_id)
);

CREATE TABLE IF NOT EXISTS credit_decision_events (
  credit_decision_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  credit_decision_id UUID NOT NULL,
  underwriting_case_id UUID NOT NULL,
  loan_package_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  previous_status TEXT,
  resulting_status TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_decision_events_decision_fk FOREIGN KEY (institution_key, credit_decision_id)
    REFERENCES credit_decisions(institution_key, credit_decision_id) ON DELETE RESTRICT,
  CONSTRAINT credit_decision_events_data_object CHECK (jsonb_typeof(event_data) = 'object')
);

CREATE INDEX IF NOT EXISTS credit_decisions_queue_idx ON credit_decisions (institution_key, status, authority_level, updated_at DESC);
CREATE INDEX IF NOT EXISTS credit_decisions_package_idx ON credit_decisions (institution_key, loan_package_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS credit_approvals_decision_idx ON credit_approvals (institution_key, credit_decision_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS credit_decision_events_idx ON credit_decision_events (institution_key, credit_decision_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_credit_decision_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CREDIT_DECISION_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS credit_decision_events_reject_update ON credit_decision_events;
CREATE TRIGGER credit_decision_events_reject_update BEFORE UPDATE ON credit_decision_events
FOR EACH ROW EXECUTE FUNCTION reject_credit_decision_event_mutation();

DROP TRIGGER IF EXISTS credit_decision_events_reject_delete ON credit_decision_events;
CREATE TRIGGER credit_decision_events_reject_delete BEFORE DELETE ON credit_decision_events
FOR EACH ROW EXECUTE FUNCTION reject_credit_decision_event_mutation();

COMMIT;