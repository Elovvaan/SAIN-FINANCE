CREATE TABLE IF NOT EXISTS security_mfa_methods (
  security_mfa_method_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  method_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  credential_id TEXT,
  public_key TEXT,
  phone_last_four TEXT,
  email_address TEXT,
  secret_reference TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  verified_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_trusted_devices (
  security_trusted_device_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  platform TEXT,
  browser TEXT,
  ip_address TEXT,
  trust_level TEXT NOT NULL DEFAULT 'STANDARD',
  status TEXT NOT NULL DEFAULT 'TRUSTED',
  trusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, user_id, device_fingerprint)
);

CREATE TABLE IF NOT EXISTS security_sessions (
  security_session_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  device_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  authentication_strength TEXT NOT NULL DEFAULT 'PASSWORD',
  risk_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, session_token_hash)
);

CREATE TABLE IF NOT EXISTS security_access_policies (
  security_access_policy_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  policy_code TEXT NOT NULL,
  policy_name TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL,
  action_pattern TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'DENY',
  priority INTEGER NOT NULL DEFAULT 100,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, policy_code)
);

CREATE TABLE IF NOT EXISTS security_encryption_keys (
  security_encryption_key_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  key_alias TEXT NOT NULL,
  key_purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_key_reference TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  rotation_interval_days INTEGER,
  next_rotation_at TIMESTAMPTZ,
  last_rotated_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, key_alias, key_version)
);

CREATE TABLE IF NOT EXISTS security_secrets (
  security_secret_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  secret_type TEXT NOT NULL,
  vault_provider TEXT NOT NULL,
  vault_reference TEXT NOT NULL,
  owner_team TEXT,
  rotation_interval_days INTEGER,
  next_rotation_at TIMESTAMPTZ,
  last_rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, secret_name)
);

CREATE TABLE IF NOT EXISTS security_events (
  security_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id TEXT,
  security_session_id UUID,
  ip_address TEXT,
  risk_score NUMERIC(8,2),
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'OPEN',
  assigned_to TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_findings (
  security_finding_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  finding_code TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  affected_asset TEXT,
  owner_user_id TEXT,
  remediation_plan TEXT,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'OPEN',
  identified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remediated_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, finding_code)
);

CREATE TABLE IF NOT EXISTS security_recovery_plans (
  security_recovery_plan_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  business_service TEXT NOT NULL,
  recovery_time_objective_minutes INTEGER,
  recovery_point_objective_minutes INTEGER,
  primary_owner TEXT NOT NULL,
  secondary_owner TEXT,
  runbook_location TEXT,
  last_tested_at TIMESTAMPTZ,
  next_test_at TIMESTAMPTZ,
  last_test_result TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, plan_code)
);

CREATE TABLE IF NOT EXISTS security_audit_events (
  security_audit_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_mfa_user_status ON security_mfa_methods(institution_key, user_id, status);
CREATE INDEX IF NOT EXISTS idx_security_devices_user_status ON security_trusted_devices(institution_key, user_id, status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_sessions_user_status ON security_sessions(institution_key, user_id, status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_policies_resource ON security_access_policies(institution_key, status, resource_type, priority);
CREATE INDEX IF NOT EXISTS idx_security_keys_rotation ON security_encryption_keys(institution_key, status, next_rotation_at);
CREATE INDEX IF NOT EXISTS idx_security_secrets_rotation ON security_secrets(institution_key, status, next_rotation_at);
CREATE INDEX IF NOT EXISTS idx_security_events_status ON security_events(institution_key, status, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_findings_status ON security_findings(institution_key, status, severity, target_date);
CREATE INDEX IF NOT EXISTS idx_security_recovery_status ON security_recovery_plans(institution_key, status, next_test_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_entity ON security_audit_events(institution_key, entity_type, entity_id, created_at DESC);
