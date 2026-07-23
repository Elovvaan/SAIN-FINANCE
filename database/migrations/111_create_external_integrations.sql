BEGIN;

CREATE TABLE IF NOT EXISTS integration_providers (
  provider_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INACTIVE',
  base_url TEXT,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  credential_reference TEXT,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT integration_provider_category_check CHECK (category IN ('PAYMENTS','IDENTITY','COMPLIANCE','CREDIT','VALUATION','COMMUNICATIONS','ESIGNATURE','OPEN_BANKING','OTHER')),
  CONSTRAINT integration_provider_status_check CHECK (status IN ('ACTIVE','INACTIVE','DEGRADED','MAINTENANCE')),
  CONSTRAINT integration_provider_configuration_object CHECK (jsonb_typeof(configuration)='object'),
  UNIQUE (institution_key, provider_id),
  UNIQUE (institution_key, provider_code)
);

CREATE TABLE IF NOT EXISTS integration_connections (
  connection_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  provider_id UUID NOT NULL,
  connection_name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'PRODUCTION',
  status TEXT NOT NULL DEFAULT 'INACTIVE',
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_health_check_at TIMESTAMPTZ,
  last_health_status TEXT,
  last_error TEXT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT integration_connection_provider_fk FOREIGN KEY (institution_key, provider_id) REFERENCES integration_providers(institution_key, provider_id) ON DELETE RESTRICT,
  CONSTRAINT integration_connection_environment_check CHECK (environment IN ('SANDBOX','TEST','PRODUCTION')),
  CONSTRAINT integration_connection_status_check CHECK (status IN ('ACTIVE','INACTIVE','DEGRADED','DISABLED')),
  CONSTRAINT integration_connection_health_check CHECK (last_health_status IS NULL OR last_health_status IN ('HEALTHY','DEGRADED','UNAVAILABLE')),
  CONSTRAINT integration_connection_capabilities_array CHECK (jsonb_typeof(capabilities)='array'),
  UNIQUE (institution_key, connection_id),
  UNIQUE (institution_key, provider_id, connection_name, environment)
);

CREATE TABLE IF NOT EXISTS integration_jobs (
  integration_job_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  connection_id UUID NOT NULL,
  operation TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  correlation_id TEXT,
  idempotency_key TEXT,
  source_entity_type TEXT,
  source_entity_id TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  created_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT integration_job_connection_fk FOREIGN KEY (institution_key, connection_id) REFERENCES integration_connections(institution_key, connection_id) ON DELETE RESTRICT,
  CONSTRAINT integration_job_direction_check CHECK (direction IN ('OUTBOUND','INBOUND')),
  CONSTRAINT integration_job_status_check CHECK (status IN ('QUEUED','PROCESSING','SUCCEEDED','FAILED','RETRY_SCHEDULED','CANCELLED','DEAD_LETTER')),
  CONSTRAINT integration_job_request_object CHECK (jsonb_typeof(request_payload)='object'),
  CONSTRAINT integration_job_response_object CHECK (response_payload IS NULL OR jsonb_typeof(response_payload)='object'),
  UNIQUE (institution_key, integration_job_id),
  UNIQUE (institution_key, idempotency_key)
);

CREATE TABLE IF NOT EXISTS integration_webhook_events (
  webhook_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  connection_id UUID NOT NULL,
  external_event_id TEXT,
  event_type TEXT NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  CONSTRAINT integration_webhook_connection_fk FOREIGN KEY (institution_key, connection_id) REFERENCES integration_connections(institution_key, connection_id) ON DELETE RESTRICT,
  CONSTRAINT integration_webhook_status_check CHECK (status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED','IGNORED')),
  CONSTRAINT integration_webhook_payload_object CHECK (jsonb_typeof(payload)='object'),
  UNIQUE (institution_key, webhook_event_id),
  UNIQUE (institution_key, connection_id, external_event_id)
);

CREATE TABLE IF NOT EXISTS integration_reconciliations (
  reconciliation_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  connection_id UUID NOT NULL,
  reconciliation_date DATE NOT NULL,
  reconciliation_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  internal_count INTEGER NOT NULL DEFAULT 0,
  external_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  exception_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT integration_reconciliation_connection_fk FOREIGN KEY (institution_key, connection_id) REFERENCES integration_connections(institution_key, connection_id) ON DELETE RESTRICT,
  CONSTRAINT integration_reconciliation_status_check CHECK (status IN ('OPEN','IN_PROGRESS','BALANCED','EXCEPTIONS','CLOSED')),
  CONSTRAINT integration_reconciliation_summary_object CHECK (jsonb_typeof(summary)='object'),
  UNIQUE (institution_key, reconciliation_id),
  UNIQUE (institution_key, connection_id, reconciliation_date, reconciliation_type)
);

CREATE TABLE IF NOT EXISTS integration_events (
  integration_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT integration_events_data_object CHECK (jsonb_typeof(event_data)='object')
);

CREATE INDEX IF NOT EXISTS integration_providers_lookup_idx ON integration_providers (institution_key,category,status);
CREATE INDEX IF NOT EXISTS integration_connections_lookup_idx ON integration_connections (institution_key,status,environment);
CREATE INDEX IF NOT EXISTS integration_jobs_queue_idx ON integration_jobs (institution_key,status,next_attempt_at,created_at);
CREATE INDEX IF NOT EXISTS integration_jobs_source_idx ON integration_jobs (institution_key,source_entity_type,source_entity_id);
CREATE INDEX IF NOT EXISTS integration_webhooks_status_idx ON integration_webhook_events (institution_key,status,received_at);
CREATE INDEX IF NOT EXISTS integration_reconciliation_lookup_idx ON integration_reconciliations (institution_key,status,reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS integration_events_entity_idx ON integration_events (institution_key,entity_type,entity_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_integration_event_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'INTEGRATION_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS integration_events_reject_update ON integration_events;
CREATE TRIGGER integration_events_reject_update BEFORE UPDATE ON integration_events FOR EACH ROW EXECUTE FUNCTION reject_integration_event_mutation();
DROP TRIGGER IF EXISTS integration_events_reject_delete ON integration_events;
CREATE TRIGGER integration_events_reject_delete BEFORE DELETE ON integration_events FOR EACH ROW EXECUTE FUNCTION reject_integration_event_mutation();

COMMIT;