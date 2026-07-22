BEGIN;

CREATE TABLE IF NOT EXISTS filing_office_packages (
  institution_key text NOT NULL,
  package_id text NOT NULL,
  package_order integer NOT NULL,
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  package_type text NOT NULL,
  status text NOT NULL,
  completion_percentage integer NOT NULL,
  return_reason text,
  package_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (institution_key, package_id),
  CONSTRAINT filing_office_packages_owner_type_check
    CHECK (owner_type IN ('INSTITUTION', 'RELATIONSHIP')),
  CONSTRAINT filing_office_packages_status_check
    CHECK (status IN (
      'ASSEMBLING',
      'REQUIRES_ACTION',
      'AWAITING_SIGNATURE',
      'READY_FOR_VERIFICATION',
      'READY_FOR_SUBMISSION',
      'SUBMITTED',
      'RECEIVED',
      'RETURNED',
      'ACTIVE',
      'ARCHIVED'
    )),
  CONSTRAINT filing_office_packages_completion_check
    CHECK (completion_percentage >= 0 AND completion_percentage <= 100)
);

CREATE INDEX IF NOT EXISTS filing_office_packages_order_idx
  ON filing_office_packages (institution_key, package_order, package_id);

CREATE INDEX IF NOT EXISTS filing_office_packages_owner_idx
  ON filing_office_packages (institution_key, owner_type, owner_id);

CREATE INDEX IF NOT EXISTS filing_office_packages_status_idx
  ON filing_office_packages (institution_key, status);

CREATE INDEX IF NOT EXISTS filing_office_packages_type_idx
  ON filing_office_packages (institution_key, package_type);

INSERT INTO filing_office_packages (
  institution_key,
  package_id,
  package_order,
  owner_type,
  owner_id,
  package_type,
  status,
  completion_percentage,
  return_reason,
  package_data
)
SELECT
  state_row.institution_key,
  package_item ->> 'id',
  package_entry.ordinality - 1,
  package_item ->> 'ownerType',
  package_item ->> 'ownerId',
  package_item ->> 'type',
  package_item ->> 'status',
  COALESCE((package_item ->> 'completionPercentage')::integer, 0),
  NULLIF(package_item ->> 'returnReason', ''),
  package_item
FROM filing_office_state AS state_row
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(state_row.state -> 'packages', '[]'::jsonb)
) WITH ORDINALITY AS package_entry(package_item, ordinality)
ON CONFLICT (institution_key, package_id) DO NOTHING;

UPDATE filing_office_state
SET state = jsonb_set(state, '{packages}', '[]'::jsonb, true),
    updated_at = NOW()
WHERE jsonb_typeof(state -> 'packages') = 'array';

COMMIT;
