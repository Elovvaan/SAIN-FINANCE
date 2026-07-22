BEGIN;

CREATE TABLE IF NOT EXISTS custodian_records (
  custodian_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  legal_name TEXT NOT NULL,
  display_name TEXT,
  custodian_type TEXT NOT NULL DEFAULT 'THIRD_PARTY',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  external_reference TEXT,
  contact_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  address_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  agreement_reference TEXT,
  agreement_effective_at TIMESTAMPTZ,
  agreement_expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT custodian_records_name_not_blank CHECK (BTRIM(legal_name) <> ''),
  CONSTRAINT custodian_records_type_check CHECK (custodian_type IN ('INTERNAL', 'THIRD_PARTY', 'FEDERAL_RESERVE', 'DEPOSITORY', 'OTHER')),
  CONSTRAINT custodian_records_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED')),
  CONSTRAINT custodian_records_contact_object CHECK (jsonb_typeof(contact_data) = 'object'),
  CONSTRAINT custodian_records_address_object CHECK (jsonb_typeof(address_data) = 'object'),
  CONSTRAINT custodian_records_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT custodian_records_agreement_dates CHECK (
    agreement_expires_at IS NULL OR agreement_effective_at IS NULL OR agreement_expires_at > agreement_effective_at
  ),
  UNIQUE (institution_key, legal_name, external_reference)
);

CREATE TABLE IF NOT EXISTS collateral_events (
  collateral_event_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL,
  collateral_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  authority_grant_id TEXT REFERENCES authority_grants(authority_grant_id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(session_id) ON DELETE RESTRICT,
  previous_status TEXT,
  resulting_status TEXT,
  amount NUMERIC,
  custodian_id TEXT REFERENCES custodian_records(custodian_id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL,
  request_id TEXT,
  source_ip INET,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT collateral_events_collateral_fk
    FOREIGN KEY (institution_key, collateral_id)
    REFERENCES filing_office_collateral(institution_key, collateral_id)
    ON DELETE RESTRICT,
  CONSTRAINT collateral_events_type_check CHECK (
    event_type IN ('CREATED', 'PLEDGED', 'CLASSIFIED', 'VALUED', 'CUSTODIAN_ASSIGNED', 'DOCUMENT_ATTACHED', 'STATUS_CHANGED', 'WITHDRAWN', 'EXCEPTION_RECORDED', 'EXCEPTION_RESOLVED', 'CORRECTED')
  ),
  CONSTRAINT collateral_events_amount_check CHECK (amount IS NULL OR amount > 0),
  CONSTRAINT collateral_events_data_object CHECK (jsonb_typeof(event_data) = 'object')
);

CREATE TABLE IF NOT EXISTS collateral_documents (
  collateral_document_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL,
  collateral_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'SUPPORTING_DOCUMENT',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attached_by TEXT,
  detached_at TIMESTAMPTZ,
  detached_by TEXT,
  detach_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT collateral_documents_collateral_fk
    FOREIGN KEY (institution_key, collateral_id)
    REFERENCES filing_office_collateral(institution_key, collateral_id)
    ON DELETE RESTRICT,
  CONSTRAINT collateral_documents_document_fk
    FOREIGN KEY (institution_key, document_id)
    REFERENCES filing_office_documents(institution_key, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT collateral_documents_relationship_check CHECK (
    relationship_type IN ('SUPPORTING_DOCUMENT', 'VALUATION', 'CUSTODY_AGREEMENT', 'OWNERSHIP_EVIDENCE', 'LIEN_EVIDENCE', 'WITHDRAWAL_EVIDENCE', 'EXCEPTION_EVIDENCE', 'OTHER')
  ),
  CONSTRAINT collateral_documents_status_check CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'DETACHED')),
  CONSTRAINT collateral_documents_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT collateral_documents_detach_consistency CHECK (
    (status = 'DETACHED' AND detached_at IS NOT NULL)
    OR status <> 'DETACHED'
  ),
  UNIQUE (institution_key, collateral_id, document_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS custodian_records_institution_status_idx
  ON custodian_records (institution_key, status, legal_name);

CREATE INDEX IF NOT EXISTS custodian_records_agreement_expiry_idx
  ON custodian_records (agreement_expires_at)
  WHERE agreement_expires_at IS NOT NULL AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS collateral_events_collateral_time_idx
  ON collateral_events (institution_key, collateral_id, occurred_at ASC, collateral_event_id ASC);

CREATE INDEX IF NOT EXISTS collateral_events_type_time_idx
  ON collateral_events (institution_key, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS collateral_events_custodian_idx
  ON collateral_events (institution_key, custodian_id, occurred_at DESC)
  WHERE custodian_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS collateral_documents_collateral_status_idx
  ON collateral_documents (institution_key, collateral_id, status, attached_at DESC);

CREATE INDEX IF NOT EXISTS collateral_documents_document_idx
  ON collateral_documents (institution_key, document_id);

CREATE OR REPLACE FUNCTION reject_collateral_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'COLLATERAL_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS collateral_events_reject_update ON collateral_events;
CREATE TRIGGER collateral_events_reject_update
BEFORE UPDATE ON collateral_events
FOR EACH ROW EXECUTE FUNCTION reject_collateral_event_mutation();

DROP TRIGGER IF EXISTS collateral_events_reject_delete ON collateral_events;
CREATE TRIGGER collateral_events_reject_delete
BEFORE DELETE ON collateral_events
FOR EACH ROW EXECUTE FUNCTION reject_collateral_event_mutation();

INSERT INTO collateral_events (
  collateral_event_id,
  institution_key,
  collateral_id,
  event_type,
  resulting_status,
  amount,
  occurred_at,
  event_data
)
SELECT
  institution_key || ':' || collateral_id || ':created',
  institution_key,
  collateral_id,
  'CREATED',
  'PLEDGED',
  amount,
  created_at,
  jsonb_build_object('migratedFrom', 'filing_office_collateral')
FROM filing_office_collateral
ON CONFLICT (collateral_event_id) DO NOTHING;

INSERT INTO collateral_events (
  collateral_event_id,
  institution_key,
  collateral_id,
  event_type,
  previous_status,
  resulting_status,
  amount,
  occurred_at,
  event_data
)
SELECT
  institution_key || ':' || collateral_id || ':withdrawn',
  institution_key,
  collateral_id,
  'WITHDRAWN',
  'PLEDGED',
  'WITHDRAWN',
  amount,
  withdrawn_at,
  jsonb_build_object('migratedFrom', 'filing_office_collateral.withdrawn_at')
FROM filing_office_collateral
WHERE status = 'WITHDRAWN' AND withdrawn_at IS NOT NULL
ON CONFLICT (collateral_event_id) DO NOTHING;

INSERT INTO collateral_events (
  collateral_event_id,
  institution_key,
  collateral_id,
  event_type,
  previous_status,
  resulting_status,
  amount,
  occurred_at,
  event_data
)
SELECT
  institution_key || ':' || collateral_id || ':legacy-exception',
  institution_key,
  collateral_id,
  'EXCEPTION_RECORDED',
  'PLEDGED',
  'EXCEPTION',
  amount,
  updated_at,
  jsonb_build_object('migratedFrom', 'filing_office_collateral.status')
FROM filing_office_collateral
WHERE status = 'EXCEPTION'
ON CONFLICT (collateral_event_id) DO NOTHING;

COMMENT ON TABLE custodian_records IS
  'Institution-scoped collateral custodians, agreement dates, references, and contact metadata.';
COMMENT ON TABLE collateral_events IS
  'Append-only collateral lifecycle history including pledge, valuation, custody, exception, and withdrawal events.';
COMMENT ON TABLE collateral_documents IS
  'Supporting documents, valuations, custody agreements, and evidence associated with collateral records.';

COMMIT;
