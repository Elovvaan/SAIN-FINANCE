BEGIN;

CREATE TABLE IF NOT EXISTS employer_funding_profiles (
  employer_funding_profile_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  employer_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  cash_gl_account_id UUID NOT NULL,
  funding_liability_gl_account_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT employer_funding_profiles_employer_not_blank CHECK (BTRIM(employer_key) <> ''),
  CONSTRAINT employer_funding_profiles_name_not_blank CHECK (BTRIM(display_name) <> ''),
  CONSTRAINT employer_funding_profiles_status_check CHECK (status IN ('ACTIVE','SUSPENDED','ARCHIVED')),
  CONSTRAINT employer_funding_profiles_distinct_accounts CHECK (cash_gl_account_id <> funding_liability_gl_account_id),
  CONSTRAINT employer_funding_profiles_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT employer_funding_profiles_cash_account_fk FOREIGN KEY (institution_key, cash_gl_account_id)
    REFERENCES gl_accounts(institution_key, gl_account_id) ON DELETE RESTRICT,
  CONSTRAINT employer_funding_profiles_liability_account_fk FOREIGN KEY (institution_key, funding_liability_gl_account_id)
    REFERENCES gl_accounts(institution_key, gl_account_id) ON DELETE RESTRICT,
  UNIQUE (institution_key, employer_key)
);

CREATE TABLE IF NOT EXISTS employer_funding_events (
  employer_funding_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  employer_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  accounting_date DATE NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED',
  financial_posting_id UUID NOT NULL,
  gl_journal_entry_id UUID NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT employer_funding_events_employer_not_blank CHECK (BTRIM(employer_key) <> ''),
  CONSTRAINT employer_funding_events_idempotency_not_blank CHECK (BTRIM(idempotency_key) <> ''),
  CONSTRAINT employer_funding_events_description_not_blank CHECK (BTRIM(description) <> ''),
  CONSTRAINT employer_funding_events_status_check CHECK (status IN ('POSTED','REVERSED')),
  CONSTRAINT employer_funding_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT employer_funding_events_posting_fk FOREIGN KEY (financial_posting_id)
    REFERENCES financial_postings(posting_id) ON DELETE RESTRICT,
  CONSTRAINT employer_funding_events_journal_fk FOREIGN KEY (institution_key, gl_journal_entry_id)
    REFERENCES gl_journal_entries(institution_key, gl_journal_entry_id) ON DELETE RESTRICT,
  UNIQUE (institution_key, idempotency_key),
  UNIQUE (institution_key, financial_posting_id)
);

CREATE INDEX IF NOT EXISTS employer_funding_events_employer_time_idx
  ON employer_funding_events (institution_key, employer_key, created_at DESC);

INSERT INTO permissions (permission_id, permission_code, permission_name, description)
VALUES
  ('permission-employer-funding-configure', 'EMPLOYER_FUNDING_CONFIGURE', 'Configure employer funding', 'Configure employer funding ledger accounts.'),
  ('permission-employer-funding-post', 'EMPLOYER_FUNDING_POST', 'Post employer funding', 'Record employer funding through the centralized financial posting service.')
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT mapping.role_id, permissions.permission_id
FROM (
  VALUES
    ('role-institution-administrator', 'EMPLOYER_FUNDING_CONFIGURE'),
    ('role-institution-administrator', 'EMPLOYER_FUNDING_POST'),
    ('role-treasury-officer', 'EMPLOYER_FUNDING_CONFIGURE'),
    ('role-treasury-officer', 'EMPLOYER_FUNDING_POST')
) AS mapping(role_id, permission_code)
JOIN permissions ON permissions.permission_code = mapping.permission_code
ON CONFLICT DO NOTHING;

COMMIT;