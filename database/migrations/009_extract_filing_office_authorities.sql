BEGIN;

CREATE TABLE IF NOT EXISTS filing_office_authorities (
  institution_key text NOT NULL,
  authority_id text NOT NULL,
  authority_order integer NOT NULL,
  actor_id text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL,
  effective_at timestamptz NOT NULL,
  expires_at timestamptz,
  authority_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (institution_key, authority_id),
  CONSTRAINT filing_office_authorities_status_check
    CHECK (status IN ('ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED', 'SUPERSEDED')),
  CONSTRAINT filing_office_authorities_expiry_check
    CHECK (expires_at IS NULL OR expires_at > effective_at)
);

CREATE INDEX IF NOT EXISTS filing_office_authorities_actor_scope_idx
  ON filing_office_authorities (institution_key, actor_id, scope);

CREATE INDEX IF NOT EXISTS filing_office_authorities_status_idx
  ON filing_office_authorities (institution_key, status);

CREATE INDEX IF NOT EXISTS filing_office_authorities_expiry_idx
  ON filing_office_authorities (institution_key, expires_at)
  WHERE expires_at IS NOT NULL;

INSERT INTO filing_office_authorities (
  institution_key,
  authority_id,
  authority_order,
  actor_id,
  scope,
  status,
  effective_at,
  expires_at,
  authority_data
)
SELECT
  state_row.institution_key,
  authority_item ->> 'id',
  authority_entry.ordinality - 1,
  authority_item ->> 'actorId',
  authority_item ->> 'scope',
  authority_item ->> 'status',
  (authority_item ->> 'effectiveAt')::timestamptz,
  NULLIF(authority_item ->> 'expiresAt', '')::timestamptz,
  authority_item
FROM filing_office_state AS state_row
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(state_row.state -> 'authorities', '[]'::jsonb)
) WITH ORDINALITY AS authority_entry(authority_item, ordinality)
ON CONFLICT (institution_key, authority_id) DO NOTHING;

UPDATE filing_office_state
SET state = jsonb_set(state, '{authorities}', '[]'::jsonb, true),
    updated_at = NOW()
WHERE jsonb_typeof(state -> 'authorities') = 'array';

COMMIT;
