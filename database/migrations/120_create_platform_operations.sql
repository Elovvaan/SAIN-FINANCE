CREATE TABLE IF NOT EXISTS platform_services (
  platform_service_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  service_code TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'PRODUCTION',
  status TEXT NOT NULL DEFAULT 'OPERATIONAL',
  health_endpoint TEXT,
  owner_team TEXT,
  description TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, service_code, environment)
);

CREATE TABLE IF NOT EXISTS platform_deployments (
  platform_deployment_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  platform_service_id UUID NOT NULL REFERENCES platform_services(platform_service_id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  commit_sha TEXT,
  environment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  initiated_by TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rollback_of_deployment_id UUID REFERENCES platform_deployments(platform_deployment_id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_incidents (
  platform_incident_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  platform_service_id UUID REFERENCES platform_services(platform_service_id) ON DELETE SET NULL,
  incident_code TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  summary TEXT,
  commander_user_id TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, incident_code)
);

CREATE TABLE IF NOT EXISTS platform_maintenance_windows (
  platform_maintenance_window_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  platform_service_id UUID REFERENCES platform_services(platform_service_id) ON DELETE CASCADE,
  maintenance_name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  impact_level TEXT NOT NULL DEFAULT 'LOW',
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_operation_events (
  platform_operation_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_services_institution_status ON platform_services(institution_key, status, environment);
CREATE INDEX IF NOT EXISTS idx_platform_deployments_service_status ON platform_deployments(institution_key, platform_service_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_incidents_institution_status ON platform_incidents(institution_key, status, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_maintenance_time ON platform_maintenance_windows(institution_key, starts_at, ends_at, status);
CREATE INDEX IF NOT EXISTS idx_platform_operation_events_entity ON platform_operation_events(institution_key, entity_type, entity_id, created_at DESC);
