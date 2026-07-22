BEGIN;

ALTER TABLE IF EXISTS filing_office_packages
  DROP CONSTRAINT IF EXISTS filing_office_packages_institution_key_package_order_key;

CREATE INDEX IF NOT EXISTS filing_office_packages_order_idx
  ON filing_office_packages (institution_key, package_order, package_id);

COMMIT;
