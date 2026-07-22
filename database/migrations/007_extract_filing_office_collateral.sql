BEGIN;

CREATE TABLE IF NOT EXISTS filing_office_collateral (
  institution_key text NOT NULL,
  collateral_id text NOT NULL,
  collateral_order integer NOT NULL,
  institution_id text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL,
  electronic boolean NOT NULL,
  credit_card_receivable boolean NOT NULL,
  third_party_custodian boolean NOT NULL,
  created_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  collateral_data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (institution_key, collateral_id),
  CONSTRAINT filing_office_collateral_amount_check CHECK (amount > 0),
  CONSTRAINT filing_office_collateral_status_check
    CHECK (status IN ('PLEDGED', 'WITHDRAWN', 'EXCEPTION'))
);

CREATE INDEX IF NOT EXISTS filing_office_collateral_institution_idx
  ON filing_office_collateral (institution_key, institution_id);

CREATE INDEX IF NOT EXISTS filing_office_collateral_status_idx
  ON filing_office_collateral (institution_key, status);

CREATE INDEX IF NOT EXISTS filing_office_collateral_characteristics_idx
  ON filing_office_collateral (
    institution_key,
    electronic,
    credit_card_receivable,
    third_party_custodian
  );

INSERT INTO filing_office_collateral (
  institution_key,
  collateral_id,
  collateral_order,
  institution_id,
  description,
  amount,
  status,
  electronic,
  credit_card_receivable,
  third_party_custodian,
  created_at,
  withdrawn_at,
  collateral_data
)
SELECT
  state_row.institution_key,
  collateral_item ->> 'id',
  collateral_entry.ordinality - 1,
  collateral_item ->> 'institutionId',
  collateral_item ->> 'description',
  (collateral_item ->> 'amount')::numeric,
  collateral_item ->> 'status',
  COALESCE((collateral_item ->> 'electronic')::boolean, false),
  COALESCE((collateral_item ->> 'creditCardReceivable')::boolean, false),
  COALESCE((collateral_item ->> 'thirdPartyCustodian')::boolean, false),
  (collateral_item ->> 'createdAt')::timestamptz,
  NULLIF(collateral_item ->> 'withdrawnAt', '')::timestamptz,
  collateral_item
FROM filing_office_state AS state_row
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(state_row.state -> 'collateral', '[]'::jsonb)
) WITH ORDINALITY AS collateral_entry(collateral_item, ordinality)
ON CONFLICT (institution_key, collateral_id) DO NOTHING;

UPDATE filing_office_state
SET state = jsonb_set(state, '{collateral}', '[]'::jsonb, true),
    updated_at = NOW()
WHERE jsonb_typeof(state -> 'collateral') = 'array';

COMMIT;
