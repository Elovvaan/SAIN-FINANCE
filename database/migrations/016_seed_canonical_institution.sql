BEGIN;

INSERT INTO institutions (
  institution_key,
  legal_name,
  display_name,
  institution_type,
  status,
  jurisdiction_country,
  jurisdiction_region,
  metadata
)
VALUES (
  'sain-finance',
  'SAIN Finance',
  'SAIN Finance',
  'FINANCIAL_SERVICES',
  'ACTIVE',
  'US',
  'UT',
  jsonb_build_object('bootstrapRecord', true)
)
ON CONFLICT (institution_key) DO NOTHING;

COMMIT;
