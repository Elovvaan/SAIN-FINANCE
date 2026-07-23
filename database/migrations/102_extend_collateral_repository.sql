BEGIN;

ALTER TABLE filing_office_collateral
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS asset_type TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS identifier TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS ownership_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS repository_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state_region TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS county TEXT,
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

ALTER TABLE filing_office_collateral
  DROP CONSTRAINT IF EXISTS filing_office_collateral_customer_fk;

ALTER TABLE filing_office_collateral
  ADD CONSTRAINT filing_office_collateral_customer_fk
  FOREIGN KEY (institution_key, customer_id)
  REFERENCES customer_profiles(institution_key, customer_id)
  ON DELETE RESTRICT;

ALTER TABLE filing_office_collateral
  DROP CONSTRAINT IF EXISTS filing_office_collateral_asset_type_check;
ALTER TABLE filing_office_collateral
  ADD CONSTRAINT filing_office_collateral_asset_type_check
  CHECK (asset_type IS NULL OR asset_type IN ('REAL_ESTATE', 'VEHICLE', 'EQUIPMENT', 'SECURITIES', 'PRECIOUS_METALS', 'INTELLECTUAL_PROPERTY', 'OTHER'));

ALTER TABLE filing_office_collateral
  DROP CONSTRAINT IF EXISTS filing_office_collateral_ownership_status_check;
ALTER TABLE filing_office_collateral
  ADD CONSTRAINT filing_office_collateral_ownership_status_check
  CHECK (ownership_status IN ('UNVERIFIED', 'OWNED', 'LEASED', 'JOINTLY_OWNED', 'THIRD_PARTY'));

ALTER TABLE filing_office_collateral
  DROP CONSTRAINT IF EXISTS filing_office_collateral_repository_status_check;
ALTER TABLE filing_office_collateral
  ADD CONSTRAINT filing_office_collateral_repository_status_check
  CHECK (repository_status IN ('PENDING', 'ACTIVE', 'RELEASED', 'LIQUIDATED', 'ARCHIVED'));

CREATE INDEX IF NOT EXISTS filing_office_collateral_customer_idx
  ON filing_office_collateral (institution_key, customer_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS filing_office_collateral_repository_status_idx
  ON filing_office_collateral (institution_key, repository_status, asset_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS filing_office_collateral_search_idx
  ON filing_office_collateral USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(identifier, '') || ' ' || coalesce(county, ''))
  );

COMMIT;
