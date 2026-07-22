BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'filing_office_documents_institution_fk') THEN
    ALTER TABLE filing_office_documents
      ADD CONSTRAINT filing_office_documents_institution_fk
      FOREIGN KEY (institution_key)
      REFERENCES institutions(institution_key)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'filing_office_documents_package_fk') THEN
    ALTER TABLE filing_office_documents
      ADD CONSTRAINT filing_office_documents_package_fk
      FOREIGN KEY (institution_key, package_id)
      REFERENCES filing_office_packages(institution_key, package_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'filing_office_document_versions_document_fk') THEN
    ALTER TABLE filing_office_document_versions
      ADD CONSTRAINT filing_office_document_versions_document_fk
      FOREIGN KEY (institution_key, document_id)
      REFERENCES filing_office_documents(institution_key, document_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'filing_office_packages_institution_fk') THEN
    ALTER TABLE filing_office_packages
      ADD CONSTRAINT filing_office_packages_institution_fk
      FOREIGN KEY (institution_key)
      REFERENCES institutions(institution_key)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'filing_office_submissions_institution_fk') THEN
    ALTER TABLE filing_office_submissions
      ADD CONSTRAINT filing_office_submissions_institution_fk
      FOREIGN KEY (institution_key)
      REFERENCES institutions(institution_key)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'filing_office_submissions_package_fk') THEN
    ALTER TABLE filing_office_submissions
      ADD CONSTRAINT filing_office_submissions_package_fk
      FOREIGN KEY (institution_key, package_id)
      REFERENCES filing_office_packages(institution_key, package_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'filing_office_collateral_institution_fk') THEN
    ALTER TABLE filing_office_collateral
      ADD CONSTRAINT filing_office_collateral_institution_fk
      FOREIGN KEY (institution_key)
      REFERENCES institutions(institution_key)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'filing_office_authorities_institution_fk') THEN
    ALTER TABLE filing_office_authorities
      ADD CONSTRAINT filing_office_authorities_institution_fk
      FOREIGN KEY (institution_key)
      REFERENCES institutions(institution_key)
      ON DELETE RESTRICT;
  END IF;
END
$$;

ALTER TABLE filing_office_audit_events
  DROP CONSTRAINT IF EXISTS filing_office_audit_events_state_fk;

ALTER TABLE filing_office_audit_events
  ADD CONSTRAINT filing_office_audit_events_institution_fk
  FOREIGN KEY (institution_key)
  REFERENCES institutions(institution_key)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS filing_office_documents_package_status_idx
  ON filing_office_documents (institution_key, package_id, status)
  WHERE package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS filing_office_document_versions_document_created_idx
  ON filing_office_document_versions (institution_key, document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS filing_office_submissions_package_status_time_idx
  ON filing_office_submissions (institution_key, package_id, status, submitted_at DESC);

COMMENT ON CONSTRAINT filing_office_audit_events_institution_fk ON filing_office_audit_events IS
  'Audit history restricts institution deletion and cannot be removed through aggregate-state cascading.';

COMMIT;
