BEGIN;

CREATE TABLE IF NOT EXISTS filing_office_submissions (
  institution_key text NOT NULL,
  submission_id text NOT NULL,
  submission_order integer NOT NULL,
  package_id text NOT NULL,
  destination text NOT NULL,
  submitted_at timestamptz NOT NULL,
  submitted_by text NOT NULL,
  status text NOT NULL,
  reason text,
  manifest jsonb NOT NULL,
  submission_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (institution_key, submission_id),
  CONSTRAINT filing_office_submissions_status_check
    CHECK (status IN ('SUBMITTED', 'RECEIVED', 'RETURNED', 'ACCEPTED')),
  CONSTRAINT filing_office_submissions_manifest_check
    CHECK (jsonb_typeof(manifest) = 'array')
);

CREATE INDEX IF NOT EXISTS filing_office_submissions_package_idx
  ON filing_office_submissions (institution_key, package_id);

CREATE INDEX IF NOT EXISTS filing_office_submissions_status_idx
  ON filing_office_submissions (institution_key, status);

CREATE INDEX IF NOT EXISTS filing_office_submissions_destination_idx
  ON filing_office_submissions (institution_key, destination);

CREATE INDEX IF NOT EXISTS filing_office_submissions_submitted_at_idx
  ON filing_office_submissions (institution_key, submitted_at DESC);

INSERT INTO filing_office_submissions (
  institution_key,
  submission_id,
  submission_order,
  package_id,
  destination,
  submitted_at,
  submitted_by,
  status,
  reason,
  manifest,
  submission_data
)
SELECT
  state_row.institution_key,
  submission_item ->> 'id',
  submission_entry.ordinality - 1,
  submission_item ->> 'packageId',
  submission_item ->> 'destination',
  (submission_item ->> 'submittedAt')::timestamptz,
  submission_item ->> 'submittedBy',
  submission_item ->> 'status',
  NULLIF(submission_item ->> 'reason', ''),
  COALESCE(submission_item -> 'manifest', '[]'::jsonb),
  submission_item
FROM filing_office_state AS state_row
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(state_row.state -> 'submissions', '[]'::jsonb)
) WITH ORDINALITY AS submission_entry(submission_item, ordinality)
ON CONFLICT (institution_key, submission_id) DO NOTHING;

UPDATE filing_office_state
SET state = jsonb_set(state, '{submissions}', '[]'::jsonb, true),
    updated_at = NOW()
WHERE jsonb_typeof(state -> 'submissions') = 'array';

COMMIT;
