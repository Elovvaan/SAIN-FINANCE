BEGIN;

CREATE TABLE IF NOT EXISTS filing_office_document_versions (
  institution_key TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  content TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  version_data JSONB NOT NULL,
  PRIMARY KEY (institution_key, document_id, version_number)
);

CREATE INDEX IF NOT EXISTS filing_office_document_versions_created_at_idx
  ON filing_office_document_versions (institution_key, created_at DESC);

CREATE INDEX IF NOT EXISTS filing_office_document_versions_checksum_idx
  ON filing_office_document_versions (institution_key, checksum);

INSERT INTO filing_office_document_versions (
  institution_key,
  document_id,
  version_number,
  content,
  checksum,
  created_at,
  created_by,
  frozen,
  version_data
)
SELECT
  state_row.institution_key,
  document->>'id',
  (version->>'version')::INTEGER,
  version->>'content',
  version->>'checksum',
  (version->>'createdAt')::TIMESTAMPTZ,
  version->>'createdBy',
  COALESCE((version->>'frozen')::BOOLEAN, FALSE),
  version
FROM filing_office_state AS state_row
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(state_row.state->'documents', '[]'::jsonb)) AS document
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(document->'versions', '[]'::jsonb)) AS version
ON CONFLICT (institution_key, document_id, version_number) DO NOTHING;

UPDATE filing_office_state
SET state = jsonb_set(
  state,
  '{documents}',
  COALESCE(
    (
      SELECT jsonb_agg(document - 'versions' || jsonb_build_object('versions', '[]'::jsonb))
      FROM jsonb_array_elements(COALESCE(state->'documents', '[]'::jsonb)) AS document
    ),
    '[]'::jsonb
  ),
  TRUE
),
updated_at = NOW();

COMMIT;
