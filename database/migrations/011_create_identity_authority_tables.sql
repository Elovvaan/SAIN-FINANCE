BEGIN;

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  email_verified_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_not_blank CHECK (BTRIM(email) <> ''),
  CONSTRAINT users_email_normalized CHECK (email = LOWER(BTRIM(email))),
  CONSTRAINT users_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'ARCHIVED')),
  CONSTRAINT users_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT users_suspension_consistency CHECK (
    (status = 'SUSPENDED' AND suspended_at IS NOT NULL)
    OR status <> 'SUSPENDED'
  ),
  UNIQUE (institution_key, email)
);

CREATE TABLE IF NOT EXISTS user_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  credential_type TEXT NOT NULL DEFAULT 'PASSWORD',
  secret_hash TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL,
  hash_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  password_changed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_credentials_type_check CHECK (credential_type IN ('PASSWORD', 'PASSKEY', 'RECOVERY')),
  CONSTRAINT user_credentials_secret_not_blank CHECK (BTRIM(secret_hash) <> ''),
  CONSTRAINT user_credentials_algorithm_not_blank CHECK (BTRIM(hash_algorithm) <> ''),
  CONSTRAINT user_credentials_parameters_object CHECK (jsonb_typeof(hash_parameters) = 'object')
);

CREATE TABLE IF NOT EXISTS roles (
  role_id TEXT PRIMARY KEY,
  institution_key TEXT REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  role_code TEXT NOT NULL,
  role_name TEXT NOT NULL,
  description TEXT,
  system_role BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roles_code_not_blank CHECK (BTRIM(role_code) <> ''),
  CONSTRAINT roles_name_not_blank CHECK (BTRIM(role_name) <> ''),
  CONSTRAINT roles_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  UNIQUE NULLS NOT DISTINCT (institution_key, role_code)
);

CREATE TABLE IF NOT EXISTS permissions (
  permission_id TEXT PRIMARY KEY,
  permission_code TEXT NOT NULL UNIQUE,
  permission_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT permissions_code_not_blank CHECK (BTRIM(permission_code) <> ''),
  CONSTRAINT permissions_name_not_blank CHECK (BTRIM(permission_name) <> ''),
  CONSTRAINT permissions_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
  permission_id TEXT NOT NULL REFERENCES permissions(permission_id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by TEXT,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_role_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  role_id TEXT NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  assigned_by TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_roles_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED', 'SUPERSEDED')),
  CONSTRAINT user_roles_date_order CHECK (expires_at IS NULL OR expires_at > effective_at),
  CONSTRAINT user_roles_revocation_consistency CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL)
    OR status <> 'REVOKED'
  ),
  UNIQUE (institution_key, user_id, role_id, effective_at)
);

CREATE TABLE IF NOT EXISTS authority_grants (
  authority_grant_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  effective_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  granted_by TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoke_reason TEXT,
  superseded_by TEXT REFERENCES authority_grants(authority_grant_id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT authority_grants_actor_not_blank CHECK (BTRIM(actor_id) <> ''),
  CONSTRAINT authority_grants_scope_not_blank CHECK (BTRIM(scope) <> ''),
  CONSTRAINT authority_grants_status_check CHECK (status IN ('ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED', 'SUPERSEDED')),
  CONSTRAINT authority_grants_date_order CHECK (expires_at IS NULL OR expires_at > effective_at),
  CONSTRAINT authority_grants_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT authority_grants_revocation_consistency CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL)
    OR status <> 'REVOKED'
  )
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoke_reason TEXT,
  source_ip INET,
  user_agent TEXT,
  device_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sessions_status_check CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  CONSTRAINT sessions_date_order CHECK (expires_at > issued_at),
  CONSTRAINT sessions_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT sessions_revocation_consistency CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL)
    OR status <> 'REVOKED'
  )
);

CREATE TABLE IF NOT EXISTS login_events (
  login_event_id TEXT PRIMARY KEY,
  institution_key TEXT REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  attempted_email TEXT,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT,
  session_id TEXT REFERENCES sessions(session_id) ON DELETE RESTRICT,
  source_ip INET,
  user_agent TEXT,
  device_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT login_events_type_check CHECK (event_type IN ('LOGIN', 'LOGOUT', 'SESSION_REFRESH', 'PASSWORD_RESET', 'EMAIL_VERIFICATION', 'MFA_CHALLENGE')),
  CONSTRAINT login_events_outcome_check CHECK (outcome IN ('SUCCESS', 'FAILURE', 'BLOCKED')),
  CONSTRAINT login_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS users_institution_status_idx
  ON users (institution_key, status, email);

CREATE INDEX IF NOT EXISTS user_credentials_user_status_idx
  ON user_credentials (user_id, revoked_at, credential_type);

CREATE INDEX IF NOT EXISTS roles_institution_status_idx
  ON roles (institution_key, status, role_code);

CREATE INDEX IF NOT EXISTS user_roles_active_lookup_idx
  ON user_roles (institution_key, user_id, status, effective_at, expires_at);

CREATE INDEX IF NOT EXISTS authority_grants_actor_scope_idx
  ON authority_grants (institution_key, actor_id, scope, status);

CREATE INDEX IF NOT EXISTS authority_grants_user_scope_idx
  ON authority_grants (institution_key, user_id, scope, status)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS authority_grants_expiry_idx
  ON authority_grants (expires_at)
  WHERE expires_at IS NOT NULL AND status IN ('ACTIVE', 'PENDING');

CREATE INDEX IF NOT EXISTS sessions_active_user_idx
  ON sessions (institution_key, user_id, expires_at)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS login_events_user_time_idx
  ON login_events (institution_key, user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS login_events_email_time_idx
  ON login_events (LOWER(attempted_email), occurred_at DESC)
  WHERE attempted_email IS NOT NULL;

INSERT INTO permissions (permission_id, permission_code, permission_name, description)
VALUES
  ('permission-package-create', 'PACKAGE_CREATE', 'Create filing packages', 'Create a new filing package.'),
  ('permission-document-generate', 'DOCUMENT_GENERATE', 'Generate documents', 'Generate or add a filing document.'),
  ('permission-signature-request', 'SIGNATURE_REQUEST', 'Request signatures', 'Request an authorized signature.'),
  ('permission-document-sign', 'DOCUMENT_SIGN', 'Sign documents', 'Sign an eligible document.'),
  ('permission-document-verify', 'DOCUMENT_VERIFY', 'Verify documents', 'Independently verify a document.'),
  ('permission-package-export', 'PACKAGE_EXPORT', 'Export packages', 'Export a controlled filing package.'),
  ('permission-package-submit', 'PACKAGE_SUBMIT', 'Submit packages', 'Record or transmit a package submission.'),
  ('permission-package-admin', 'PACKAGE_ADMIN', 'Administer packages', 'Perform package administration actions.'),
  ('permission-collateral-add', 'COLLATERAL_ADD', 'Add collateral', 'Add a collateral record.'),
  ('permission-collateral-withdraw', 'COLLATERAL_WITHDRAW', 'Withdraw collateral', 'Withdraw an eligible collateral record.')
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO roles (role_id, institution_key, role_code, role_name, description, system_role)
VALUES
  ('role-institution-administrator', NULL, 'INSTITUTION_ADMIN', 'Institution Administrator', 'Institution-wide administration role.', TRUE),
  ('role-filing-officer', NULL, 'FILING_OFFICER', 'Filing Officer', 'Creates and manages filing packages.', TRUE),
  ('role-document-preparer', NULL, 'DOCUMENT_PREPARER', 'Document Preparer', 'Generates and prepares filing documents.', TRUE),
  ('role-authorized-signer', NULL, 'AUTHORIZED_SIGNER', 'Authorized Signer', 'Signs documents under an active authority grant.', TRUE),
  ('role-document-verifier', NULL, 'DOCUMENT_VERIFIER', 'Document Verifier', 'Independently verifies filing documents.', TRUE),
  ('role-submission-officer', NULL, 'SUBMISSION_OFFICER', 'Submission Officer', 'Exports and submits completed packages.', TRUE),
  ('role-collateral-officer', NULL, 'COLLATERAL_OFFICER', 'Collateral Officer', 'Manages collateral records and withdrawals.', TRUE),
  ('role-treasury-officer', NULL, 'TREASURY_OFFICER', 'Treasury Officer', 'Reviews treasury readiness and obligations.', TRUE),
  ('role-compliance-reviewer', NULL, 'COMPLIANCE_REVIEWER', 'Compliance Reviewer', 'Reviews exceptions and compliance evidence.', TRUE),
  ('role-read-only-auditor', NULL, 'READ_ONLY_AUDITOR', 'Read-Only Auditor', 'Reads operational and audit records without mutation authority.', TRUE)
ON CONFLICT (institution_key, role_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-institution-administrator', permission_id FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT mapping.role_id, permissions.permission_id
FROM (
  VALUES
    ('role-filing-officer', 'PACKAGE_CREATE'),
    ('role-filing-officer', 'DOCUMENT_GENERATE'),
    ('role-filing-officer', 'SIGNATURE_REQUEST'),
    ('role-document-preparer', 'DOCUMENT_GENERATE'),
    ('role-authorized-signer', 'DOCUMENT_SIGN'),
    ('role-document-verifier', 'DOCUMENT_VERIFY'),
    ('role-submission-officer', 'PACKAGE_EXPORT'),
    ('role-submission-officer', 'PACKAGE_SUBMIT'),
    ('role-collateral-officer', 'COLLATERAL_ADD'),
    ('role-collateral-officer', 'COLLATERAL_WITHDRAW'),
    ('role-compliance-reviewer', 'PACKAGE_ADMIN')
) AS mapping(role_id, permission_code)
JOIN permissions ON permissions.permission_code = mapping.permission_code
ON CONFLICT DO NOTHING;

INSERT INTO authority_grants (
  authority_grant_id,
  institution_key,
  actor_id,
  scope,
  status,
  effective_at,
  expires_at,
  metadata
)
SELECT
  authority_id,
  institution_key,
  actor_id,
  scope,
  status,
  effective_at,
  expires_at,
  jsonb_build_object(
    'migratedFrom', 'filing_office_authorities',
    'authorityData', authority_data
  )
FROM filing_office_authorities
ON CONFLICT (authority_grant_id) DO NOTHING;

COMMENT ON TABLE users IS
  'Individual institution user accounts. Phase 3 will connect live authentication flows to these records.';

COMMENT ON TABLE user_credentials IS
  'Hashed authentication credentials; plaintext credentials are never stored.';

COMMENT ON TABLE authority_grants IS
  'Time-limited actor authority scopes, including records migrated from the Filing Office authority collection.';

COMMENT ON TABLE sessions IS
  'Revocable database-backed user sessions. Existing signed cookies remain transitional until Phase 3 integration.';

COMMENT ON TABLE login_events IS
  'Append-oriented authentication and session event history.';

COMMIT;
