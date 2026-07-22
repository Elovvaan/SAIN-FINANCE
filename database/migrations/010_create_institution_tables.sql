BEGIN;

CREATE TABLE IF NOT EXISTS institutions (
  institution_key TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  display_name TEXT,
  institution_type TEXT NOT NULL DEFAULT 'FINANCIAL_SERVICES',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  jurisdiction_country TEXT NOT NULL DEFAULT 'US',
  jurisdiction_region TEXT,
  external_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT institutions_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT institutions_status_not_blank CHECK (BTRIM(status) <> ''),
  CONSTRAINT institutions_legal_name_not_blank CHECK (BTRIM(legal_name) <> '')
);

INSERT INTO institutions (
  institution_key,
  legal_name,
  display_name,
  institution_type,
  status,
  metadata
)
SELECT
  institution_key,
  COALESCE(NULLIF(BTRIM(state->>'institutionName'), ''), institution_key),
  NULLIF(BTRIM(state->>'institutionName'), ''),
  COALESCE(NULLIF(BTRIM(state->>'institutionType'), ''), 'FINANCIAL_SERVICES'),
  'ACTIVE',
  jsonb_build_object('migratedFrom', 'filing_office_state')
FROM filing_office_state
ON CONFLICT (institution_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS institution_settings (
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (institution_key, setting_key),
  CONSTRAINT institution_settings_key_not_blank CHECK (BTRIM(setting_key) <> '')
);

CREATE TABLE IF NOT EXISTS institution_prerequisites (
  prerequisite_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  prerequisite_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  required BOOLEAN NOT NULL DEFAULT TRUE,
  due_at TIMESTAMPTZ,
  satisfied_at TIMESTAMPTZ,
  satisfied_by TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT institution_prerequisites_evidence_object CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT institution_prerequisites_type_not_blank CHECK (BTRIM(prerequisite_type) <> ''),
  CONSTRAINT institution_prerequisites_title_not_blank CHECK (BTRIM(title) <> ''),
  CONSTRAINT institution_prerequisites_satisfied_consistency CHECK (
    (status = 'SATISFIED' AND satisfied_at IS NOT NULL)
    OR status <> 'SATISFIED'
  )
);

CREATE TABLE IF NOT EXISTS institution_regulatory_profiles (
  regulatory_profile_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  regulator_code TEXT NOT NULL,
  charter_type TEXT,
  jurisdiction_country TEXT NOT NULL DEFAULT 'US',
  jurisdiction_region TEXT,
  registration_number TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  effective_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT institution_regulatory_profiles_data_object CHECK (jsonb_typeof(profile_data) = 'object'),
  CONSTRAINT institution_regulatory_profiles_regulator_not_blank CHECK (BTRIM(regulator_code) <> ''),
  CONSTRAINT institution_regulatory_profiles_date_order CHECK (
    expires_at IS NULL OR effective_at IS NULL OR expires_at > effective_at
  ),
  UNIQUE (institution_key, regulator_code, registration_number)
);

CREATE INDEX IF NOT EXISTS institutions_status_idx
  ON institutions (status, institution_key);

CREATE INDEX IF NOT EXISTS institution_settings_updated_at_idx
  ON institution_settings (institution_key, updated_at DESC);

CREATE INDEX IF NOT EXISTS institution_prerequisites_status_idx
  ON institution_prerequisites (institution_key, status, required);

CREATE INDEX IF NOT EXISTS institution_prerequisites_due_at_idx
  ON institution_prerequisites (due_at)
  WHERE due_at IS NOT NULL AND status <> 'SATISFIED';

CREATE INDEX IF NOT EXISTS institution_regulatory_profiles_lookup_idx
  ON institution_regulatory_profiles (institution_key, regulator_code, status);

CREATE INDEX IF NOT EXISTS institution_regulatory_profiles_expiry_idx
  ON institution_regulatory_profiles (expires_at)
  WHERE expires_at IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'filing_office_state_institution_fk'
  ) THEN
    ALTER TABLE filing_office_state
      ADD CONSTRAINT filing_office_state_institution_fk
      FOREIGN KEY (institution_key)
      REFERENCES institutions(institution_key)
      ON DELETE RESTRICT;
  END IF;
END
$$;

COMMENT ON TABLE institutions IS
  'Canonical institution identity and lifecycle record for SAIN Finance.';

COMMENT ON TABLE institution_settings IS
  'Database-backed institution configuration keyed by institution and setting name.';

COMMENT ON TABLE institution_prerequisites IS
  'Operational and regulatory prerequisites required before institution workflows may proceed.';

COMMENT ON TABLE institution_regulatory_profiles IS
  'Regulator, charter, registration, jurisdiction, and effective-date profiles associated with an institution.';

COMMIT;
