BEGIN;

CREATE TABLE IF NOT EXISTS workflow_events (
  workflow_event_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  workflow_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  package_id TEXT,
  document_id TEXT,
  submission_id TEXT,
  collateral_id TEXT,
  actor_id TEXT,
  user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  authority_grant_id TEXT REFERENCES authority_grants(authority_grant_id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(session_id) ON DELETE RESTRICT,
  operation TEXT NOT NULL,
  previous_state TEXT,
  resulting_state TEXT,
  request_id TEXT,
  source_ip INET,
  occurred_at TIMESTAMPTZ NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_events_package_fk
    FOREIGN KEY (institution_key, package_id)
    REFERENCES filing_office_packages(institution_key, package_id)
    ON DELETE RESTRICT,
  CONSTRAINT workflow_events_document_fk
    FOREIGN KEY (institution_key, document_id)
    REFERENCES filing_office_documents(institution_key, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT workflow_events_submission_fk
    FOREIGN KEY (institution_key, submission_id)
    REFERENCES filing_office_submissions(institution_key, submission_id)
    ON DELETE RESTRICT,
  CONSTRAINT workflow_events_collateral_fk
    FOREIGN KEY (institution_key, collateral_id)
    REFERENCES filing_office_collateral(institution_key, collateral_id)
    ON DELETE RESTRICT,
  CONSTRAINT workflow_events_type_not_blank CHECK (BTRIM(workflow_type) <> ''),
  CONSTRAINT workflow_events_entity_type_not_blank CHECK (BTRIM(entity_type) <> ''),
  CONSTRAINT workflow_events_entity_id_not_blank CHECK (BTRIM(entity_id) <> ''),
  CONSTRAINT workflow_events_operation_not_blank CHECK (BTRIM(operation) <> ''),
  CONSTRAINT workflow_events_data_object CHECK (jsonb_typeof(event_data) = 'object')
);

CREATE TABLE IF NOT EXISTS exceptions (
  exception_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  package_id TEXT,
  document_id TEXT,
  submission_id TEXT,
  collateral_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  detected_by TEXT,
  detected_at TIMESTAMPTZ NOT NULL,
  assigned_to_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  due_at TIMESTAMPTZ,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  superseded_by TEXT REFERENCES exceptions(exception_id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exceptions_package_fk
    FOREIGN KEY (institution_key, package_id)
    REFERENCES filing_office_packages(institution_key, package_id)
    ON DELETE RESTRICT,
  CONSTRAINT exceptions_document_fk
    FOREIGN KEY (institution_key, document_id)
    REFERENCES filing_office_documents(institution_key, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT exceptions_submission_fk
    FOREIGN KEY (institution_key, submission_id)
    REFERENCES filing_office_submissions(institution_key, submission_id)
    ON DELETE RESTRICT,
  CONSTRAINT exceptions_collateral_fk
    FOREIGN KEY (institution_key, collateral_id)
    REFERENCES filing_office_collateral(institution_key, collateral_id)
    ON DELETE RESTRICT,
  CONSTRAINT exceptions_type_not_blank CHECK (BTRIM(exception_type) <> ''),
  CONSTRAINT exceptions_entity_type_not_blank CHECK (BTRIM(entity_type) <> ''),
  CONSTRAINT exceptions_entity_id_not_blank CHECK (BTRIM(entity_id) <> ''),
  CONSTRAINT exceptions_title_not_blank CHECK (BTRIM(title) <> ''),
  CONSTRAINT exceptions_severity_check CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT exceptions_status_check CHECK (status IN ('OPEN', 'ASSIGNED', 'UNDER_REVIEW', 'RESOLVED', 'WAIVED', 'SUPERSEDED')),
  CONSTRAINT exceptions_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT exceptions_resolution_consistency CHECK (
    (status IN ('RESOLVED', 'WAIVED') AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    OR status NOT IN ('RESOLVED', 'WAIVED')
  )
);

CREATE TABLE IF NOT EXISTS manual_reviews (
  manual_review_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  review_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  exception_id TEXT REFERENCES exceptions(exception_id) ON DELETE RESTRICT,
  package_id TEXT,
  document_id TEXT,
  submission_id TEXT,
  collateral_id TEXT,
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  assigned_to_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ,
  reviewer_actor_id TEXT,
  reviewer_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  authority_grant_id TEXT REFERENCES authority_grants(authority_grant_id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(session_id) ON DELETE RESTRICT,
  decision TEXT,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT manual_reviews_package_fk
    FOREIGN KEY (institution_key, package_id)
    REFERENCES filing_office_packages(institution_key, package_id)
    ON DELETE RESTRICT,
  CONSTRAINT manual_reviews_document_fk
    FOREIGN KEY (institution_key, document_id)
    REFERENCES filing_office_documents(institution_key, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT manual_reviews_submission_fk
    FOREIGN KEY (institution_key, submission_id)
    REFERENCES filing_office_submissions(institution_key, submission_id)
    ON DELETE RESTRICT,
  CONSTRAINT manual_reviews_collateral_fk
    FOREIGN KEY (institution_key, collateral_id)
    REFERENCES filing_office_collateral(institution_key, collateral_id)
    ON DELETE RESTRICT,
  CONSTRAINT manual_reviews_type_not_blank CHECK (BTRIM(review_type) <> ''),
  CONSTRAINT manual_reviews_entity_type_not_blank CHECK (BTRIM(entity_type) <> ''),
  CONSTRAINT manual_reviews_entity_id_not_blank CHECK (BTRIM(entity_id) <> ''),
  CONSTRAINT manual_reviews_requested_by_not_blank CHECK (BTRIM(requested_by) <> ''),
  CONSTRAINT manual_reviews_status_check CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'COMPLETED')),
  CONSTRAINT manual_reviews_findings_object CHECK (jsonb_typeof(findings) = 'object'),
  CONSTRAINT manual_reviews_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT manual_reviews_decision_consistency CHECK (
    (status IN ('APPROVED', 'REJECTED', 'RETURNED', 'COMPLETED') AND decision IS NOT NULL AND decided_at IS NOT NULL)
    OR status NOT IN ('APPROVED', 'REJECTED', 'RETURNED', 'COMPLETED')
  )
);

CREATE TABLE IF NOT EXISTS system_configuration (
  configuration_id TEXT PRIMARY KEY,
  institution_key TEXT REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  configuration_scope TEXT NOT NULL DEFAULT 'INSTITUTION',
  configuration_key TEXT NOT NULL,
  configuration_value JSONB NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'JSON',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  updated_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT system_configuration_scope_check CHECK (configuration_scope IN ('GLOBAL', 'INSTITUTION', 'WORKFLOW', 'SECURITY', 'INTEGRATION')),
  CONSTRAINT system_configuration_key_not_blank CHECK (BTRIM(configuration_key) <> ''),
  CONSTRAINT system_configuration_type_check CHECK (value_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'SECRET_REFERENCE')),
  CONSTRAINT system_configuration_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUPERSEDED', 'EXPIRED')),
  CONSTRAINT system_configuration_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT system_configuration_date_order CHECK (expires_at IS NULL OR expires_at > effective_at),
  UNIQUE NULLS NOT DISTINCT (institution_key, configuration_scope, configuration_key, version)
);

CREATE INDEX IF NOT EXISTS workflow_events_entity_time_idx
  ON workflow_events (institution_key, entity_type, entity_id, occurred_at ASC, workflow_event_id ASC);

CREATE INDEX IF NOT EXISTS workflow_events_operation_time_idx
  ON workflow_events (institution_key, operation, occurred_at DESC);

CREATE INDEX IF NOT EXISTS workflow_events_request_idx
  ON workflow_events (institution_key, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS exceptions_open_queue_idx
  ON exceptions (institution_key, severity DESC, detected_at ASC)
  WHERE status IN ('OPEN', 'ASSIGNED', 'UNDER_REVIEW');

CREATE INDEX IF NOT EXISTS exceptions_entity_idx
  ON exceptions (institution_key, entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS exceptions_due_idx
  ON exceptions (due_at)
  WHERE due_at IS NOT NULL AND status IN ('OPEN', 'ASSIGNED', 'UNDER_REVIEW');

CREATE INDEX IF NOT EXISTS manual_reviews_queue_idx
  ON manual_reviews (institution_key, status, requested_at ASC);

CREATE INDEX IF NOT EXISTS manual_reviews_assignee_idx
  ON manual_reviews (institution_key, assigned_to_user_id, status, requested_at ASC)
  WHERE assigned_to_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS system_configuration_active_lookup_idx
  ON system_configuration (institution_key, configuration_scope, configuration_key, effective_at DESC)
  WHERE status = 'ACTIVE';

CREATE OR REPLACE FUNCTION reject_workflow_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'WORKFLOW_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS workflow_events_reject_update ON workflow_events;
CREATE TRIGGER workflow_events_reject_update
BEFORE UPDATE ON workflow_events
FOR EACH ROW EXECUTE FUNCTION reject_workflow_event_mutation();

DROP TRIGGER IF EXISTS workflow_events_reject_delete ON workflow_events;
CREATE TRIGGER workflow_events_reject_delete
BEFORE DELETE ON workflow_events
FOR EACH ROW EXECUTE FUNCTION reject_workflow_event_mutation();

INSERT INTO workflow_events (
  workflow_event_id,
  institution_key,
  workflow_type,
  entity_type,
  entity_id,
  actor_id,
  operation,
  previous_state,
  resulting_state,
  occurred_at,
  event_data
)
SELECT
  event_id::text,
  institution_key,
  'FILING_OFFICE',
  COALESCE(NULLIF(event ->> 'targetType', ''), 'UNKNOWN'),
  target_id,
  actor_id,
  operation,
  previous_state,
  resulting_state,
  occurred_at,
  jsonb_build_object(
    'migratedFrom', 'filing_office_audit_events',
    'auditEventId', event_id,
    'authorityId', authority_id,
    'event', event
  )
FROM filing_office_audit_events
ON CONFLICT (workflow_event_id) DO NOTHING;

COMMENT ON TABLE workflow_events IS
  'Append-only operational workflow transitions, separate from the audit ledger but correlated through request and event metadata.';
COMMENT ON TABLE exceptions IS
  'Detected workflow, document, submission, collateral, authority, and system exceptions requiring resolution or waiver.';
COMMENT ON TABLE manual_reviews IS
  'Human review assignments, findings, decisions, and completion records for exceptions and controlled workflow decisions.';
COMMENT ON TABLE system_configuration IS
  'Versioned global and institution-scoped operational configuration. Secret values should be stored as external secret references.';

COMMIT;
