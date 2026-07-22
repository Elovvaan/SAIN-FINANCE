BEGIN;

CREATE TABLE IF NOT EXISTS filing_office_documents (
  institution_key text NOT NULL,
  document_id text NOT NULL,
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  package_id text,
  document_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  template_class text NOT NULL,
  source_verification_required boolean NOT NULL,
  signed_by text,
  verified_by text,
  document_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (institution_key, document_id),
  CONSTRAINT filing_office_documents_owner_type_check
    CHECK (owner_type IN ('INSTITUTION', 'RELATIONSHIP')),
  CONSTRAINT filing_office_documents_status_check
    CHECK (status IN (
      'GENERATED',
      'AWAITING_SIGNATURE',
      'SIGNED',
      'VERIFIED',
      'SUBMITTED',
      'RETURNED',
      'ARCHIVED'
    )),
  CONSTRAINT filing_office_documents_template_class_check
    CHECK (template_class IN (
      'OFFICIAL_EXTERNAL_TEMPLATE',
      'SAIN_INTERNAL_TEMPLATE'
    ))
);

CREATE INDEX IF NOT EXISTS filing_office_documents_package_idx
  ON filing_office_documents (institution_key, package_id)
  WHERE package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS filing_office_documents_owner_idx
  ON filing_office_documents (institution_key, owner_type, owner_id);

CREATE INDEX IF NOT EXISTS filing_office_documents_status_idx
  ON filing_office_documents (institution_key, status);

CREATE INDEX IF NOT EXISTS filing_office_documents_type_idx
  ON filing_office_documents (institution_key, document_type);

INSERT INTO filing_office_documents (
  institution_key,
  document_id,
  owner_type,
  owner_id,
  package_id,
  document_type,
  title,
  status,
  template_class,
  source_verification_required,
  signed_by,
  verified_by,
  document_data
)
SELECT
  state_row.institution_key,
  document ->> 'id',
  document ->> 'ownerType',
  document ->> 'ownerId',
  NULLIF(document ->> 'packageId', ''),
  document ->> 'type',
  document ->> 'title',
  document ->> 'status',
  document ->> 'templateClass',
  COALESCE((document ->> 'sourceVerificationRequired')::boolean, false),
  NULLIF(document ->> 'signedBy', ''),
  NULLIF(document ->> 'verifiedBy', ''),
  document - 'versions'
FROM filing_office_state AS state_row
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(state_row.state -> 'documents', '[]'::jsonb)
) AS document
ON CONFLICT (institution_key, document_id) DO NOTHING;

UPDATE filing_office_state
SET state = jsonb_set(state, '{documents}', '[]'::jsonb, true),
    updated_at = NOW()
WHERE jsonb_typeof(state -> 'documents') = 'array';

COMMIT;
