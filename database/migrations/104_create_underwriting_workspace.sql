BEGIN;

CREATE TABLE IF NOT EXISTS underwriting_cases (
  underwriting_case_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  loan_package_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  assigned_underwriter_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  risk_score NUMERIC(8,3),
  recommendation TEXT,
  summary TEXT,
  submitted_at TIMESTAMPTZ,
  review_started_at TIMESTAMPTZ,
  recommendation_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT underwriting_cases_package_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT underwriting_cases_status_check CHECK (status IN ('QUEUED','IN_REVIEW','CONDITIONAL','RECOMMENDED_APPROVAL','RECOMMENDED_DECLINE','COMPLETED','CANCELLED')),
  CONSTRAINT underwriting_cases_priority_check CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  CONSTRAINT underwriting_cases_recommendation_check CHECK (recommendation IS NULL OR recommendation IN ('APPROVE','CONDITIONAL_APPROVAL','DECLINE','RETURN_FOR_INFORMATION')),
  CONSTRAINT underwriting_cases_risk_score_check CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 1000)),
  CONSTRAINT underwriting_cases_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, underwriting_case_id),
  UNIQUE (institution_key, loan_package_id)
);

CREATE TABLE IF NOT EXISTS underwriting_conditions (
  underwriting_condition_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  underwriting_case_id UUID NOT NULL,
  condition_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  required BOOLEAN NOT NULL DEFAULT TRUE,
  due_at TIMESTAMPTZ,
  satisfied_at TIMESTAMPTZ,
  waived_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  resolved_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT underwriting_conditions_case_fk FOREIGN KEY (institution_key, underwriting_case_id)
    REFERENCES underwriting_cases(institution_key, underwriting_case_id) ON DELETE RESTRICT,
  CONSTRAINT underwriting_conditions_type_check CHECK (condition_type IN ('IDENTITY','INCOME','CREDIT','COLLATERAL','VALUATION','TITLE','INSURANCE','COMPLIANCE','DOCUMENT','OTHER')),
  CONSTRAINT underwriting_conditions_status_check CHECK (status IN ('OPEN','IN_PROGRESS','SATISFIED','WAIVED','FAILED')),
  CONSTRAINT underwriting_conditions_title_not_blank CHECK (BTRIM(title) <> ''),
  CONSTRAINT underwriting_conditions_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS underwriting_notes (
  underwriting_note_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  underwriting_case_id UUID NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'INTERNAL',
  note_text TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT underwriting_notes_case_fk FOREIGN KEY (institution_key, underwriting_case_id)
    REFERENCES underwriting_cases(institution_key, underwriting_case_id) ON DELETE RESTRICT,
  CONSTRAINT underwriting_notes_type_check CHECK (note_type IN ('INTERNAL','RISK','DOCUMENT','COLLATERAL','DECISION')),
  CONSTRAINT underwriting_notes_text_not_blank CHECK (BTRIM(note_text) <> '')
);

CREATE TABLE IF NOT EXISTS underwriting_events (
  underwriting_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  underwriting_case_id UUID NOT NULL,
  loan_package_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  previous_status TEXT,
  resulting_status TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT underwriting_events_case_fk FOREIGN KEY (institution_key, underwriting_case_id)
    REFERENCES underwriting_cases(institution_key, underwriting_case_id) ON DELETE RESTRICT,
  CONSTRAINT underwriting_events_package_fk FOREIGN KEY (institution_key, loan_package_id)
    REFERENCES loan_packages(institution_key, loan_package_id) ON DELETE RESTRICT,
  CONSTRAINT underwriting_events_data_object CHECK (jsonb_typeof(event_data) = 'object')
);

CREATE INDEX IF NOT EXISTS underwriting_cases_queue_idx ON underwriting_cases (institution_key, status, priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS underwriting_cases_assignee_idx ON underwriting_cases (institution_key, assigned_underwriter_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS underwriting_conditions_case_status_idx ON underwriting_conditions (institution_key, underwriting_case_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS underwriting_notes_case_idx ON underwriting_notes (institution_key, underwriting_case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS underwriting_events_case_idx ON underwriting_events (institution_key, underwriting_case_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_underwriting_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'UNDERWRITING_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS underwriting_events_reject_update ON underwriting_events;
CREATE TRIGGER underwriting_events_reject_update BEFORE UPDATE ON underwriting_events
FOR EACH ROW EXECUTE FUNCTION reject_underwriting_event_mutation();

DROP TRIGGER IF EXISTS underwriting_events_reject_delete ON underwriting_events;
CREATE TRIGGER underwriting_events_reject_delete BEFORE DELETE ON underwriting_events
FOR EACH ROW EXECUTE FUNCTION reject_underwriting_event_mutation();

COMMIT;