CREATE TABLE IF NOT EXISTS reporting_definitions (
  reporting_definition_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  report_code TEXT NOT NULL,
  report_name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  audience TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  template_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_source_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, report_code)
);

CREATE TABLE IF NOT EXISTS reporting_schedules (
  reporting_schedule_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  reporting_definition_id UUID NOT NULL REFERENCES reporting_definitions(reporting_definition_id) ON DELETE CASCADE,
  schedule_name TEXT NOT NULL,
  frequency TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Denver',
  next_run_at TIMESTAMPTZ,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_channels JSONB NOT NULL DEFAULT '["PORTAL"]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reporting_runs (
  reporting_run_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  reporting_definition_id UUID NOT NULL REFERENCES reporting_definitions(reporting_definition_id),
  reporting_schedule_id UUID REFERENCES reporting_schedules(reporting_schedule_id),
  reporting_period_start DATE,
  reporting_period_end DATE,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  output_format TEXT NOT NULL DEFAULT 'PDF',
  output_location TEXT,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  requested_by TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reporting_sections (
  reporting_section_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  reporting_run_id UUID NOT NULL REFERENCES reporting_runs(reporting_run_id) ON DELETE CASCADE,
  section_code TEXT NOT NULL,
  section_name TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  section_type TEXT NOT NULL,
  section_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'COMPLETE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, reporting_run_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS reporting_events (
  reporting_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reporting_definitions_institution_status ON reporting_definitions(institution_key, status, report_type);
CREATE INDEX IF NOT EXISTS idx_reporting_schedules_institution_status ON reporting_schedules(institution_key, status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_reporting_runs_institution_status ON reporting_runs(institution_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reporting_runs_definition ON reporting_runs(institution_key, reporting_definition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reporting_events_entity ON reporting_events(institution_key, entity_type, entity_id, created_at DESC);