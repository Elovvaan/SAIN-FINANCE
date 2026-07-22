BEGIN;

CREATE TABLE IF NOT EXISTS user_mfa_methods (
  mfa_method_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  method_type TEXT NOT NULL DEFAULT 'TOTP',
  status TEXT NOT NULL DEFAULT 'PENDING',
  encrypted_secret TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  secret_auth_tag TEXT NOT NULL,
  recovery_code_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  disabled_at TIMESTAMPTZ,
  disabled_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  disable_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_mfa_method_type_check CHECK (method_type = 'TOTP'),
  CONSTRAINT user_mfa_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'DISABLED')),
  CONSTRAINT user_mfa_secret_not_blank CHECK (BTRIM(encrypted_secret) <> ''),
  CONSTRAINT user_mfa_iv_not_blank CHECK (BTRIM(secret_iv) <> ''),
  CONSTRAINT user_mfa_auth_tag_not_blank CHECK (BTRIM(secret_auth_tag) <> ''),
  CONSTRAINT user_mfa_recovery_codes_array CHECK (jsonb_typeof(recovery_code_hashes) = 'array'),
  CONSTRAINT user_mfa_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT user_mfa_disabled_consistency CHECK (
    (status = 'DISABLED' AND disabled_at IS NOT NULL AND disabled_by IS NOT NULL)
    OR status <> 'DISABLED'
  ),
  CONSTRAINT user_mfa_verified_consistency CHECK (
    (status = 'ACTIVE' AND verified_at IS NOT NULL)
    OR status <> 'ACTIVE'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS user_mfa_one_current_method_idx
  ON user_mfa_methods (institution_key, user_id)
  WHERE status IN ('PENDING', 'ACTIVE');

CREATE INDEX IF NOT EXISTS user_mfa_active_lookup_idx
  ON user_mfa_methods (institution_key, user_id, status);

CREATE INDEX IF NOT EXISTS user_mfa_lockout_idx
  ON user_mfa_methods (locked_until)
  WHERE status = 'ACTIVE' AND locked_until IS NOT NULL;

COMMIT;
