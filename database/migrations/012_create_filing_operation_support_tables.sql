BEGIN;

CREATE TABLE IF NOT EXISTS filing_package_requirements (
  requirement_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL,
  package_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  requirement_kind TEXT NOT NULL DEFAULT 'REQUIRED',
  status TEXT NOT NULL DEFAULT 'MISSING',
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  satisfied_document_id TEXT,
  satisfied_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT filing_package_requirements_package_fk
    FOREIGN KEY (institution_key, package_id)
    REFERENCES filing_office_packages(institution_key, package_id)
    ON DELETE RESTRICT,
  CONSTRAINT filing_package_requirements_document_fk
    FOREIGN KEY (institution_key, satisfied_document_id)
    REFERENCES filing_office_documents(institution_key, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT filing_package_requirements_type_not_blank CHECK (BTRIM(document_type) <> ''),
  CONSTRAINT filing_package_requirements_kind_check CHECK (requirement_kind IN ('REQUIRED', 'CONDITIONAL')),
  CONSTRAINT filing_package_requirements_status_check CHECK (status IN ('MISSING', 'PRESENT', 'SIGNED', 'VERIFIED', 'SUBMITTED', 'WAIVED')),
  CONSTRAINT filing_package_requirements_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT filing_package_requirements_satisfaction_consistency CHECK (
    (status = 'MISSING' AND satisfied_document_id IS NULL AND satisfied_at IS NULL)
    OR status <> 'MISSING'
  ),
  UNIQUE (institution_key, package_id, document_type, requirement_kind)
);

CREATE TABLE IF NOT EXISTS document_signatures (
  signature_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL,
  document_id TEXT NOT NULL,
  signer_actor_id TEXT NOT NULL,
  signer_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  authority_grant_id TEXT REFERENCES authority_grants(authority_grant_id) ON DELETE RESTRICT,
  signature_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECORDED',
  signed_at TIMESTAMPTZ NOT NULL,
  document_version INTEGER,
  document_checksum TEXT,
  session_id TEXT REFERENCES sessions(session_id) ON DELETE RESTRICT,
  source_ip INET,
  consent_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_certificate JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_placement JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  invalidated_at TIMESTAMPTZ,
  invalidated_by TEXT,
  invalidation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_signatures_document_fk
    FOREIGN KEY (institution_key, document_id)
    REFERENCES filing_office_documents(institution_key, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_signatures_actor_not_blank CHECK (BTRIM(signer_actor_id) <> ''),
  CONSTRAINT document_signatures_method_not_blank CHECK (BTRIM(signature_method) <> ''),
  CONSTRAINT document_signatures_status_check CHECK (status IN ('REQUESTED', 'RECORDED', 'VALID', 'INVALIDATED', 'REJECTED')),
  CONSTRAINT document_signatures_version_check CHECK (document_version IS NULL OR document_version > 0),
  CONSTRAINT document_signatures_consent_object CHECK (jsonb_typeof(consent_record) = 'object'),
  CONSTRAINT document_signatures_certificate_object CHECK (jsonb_typeof(signature_certificate) = 'object'),
  CONSTRAINT document_signatures_placement_object CHECK (jsonb_typeof(signature_placement) = 'object'),
  CONSTRAINT document_signatures_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT document_signatures_invalidation_consistency CHECK (
    (status = 'INVALIDATED' AND invalidated_at IS NOT NULL)
    OR status <> 'INVALIDATED'
  )
);

CREATE TABLE IF NOT EXISTS document_verifications (
  verification_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL,
  document_id TEXT NOT NULL,
  verifier_actor_id TEXT NOT NULL,
  verifier_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  authority_grant_id TEXT REFERENCES authority_grants(authority_grant_id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  verification_method TEXT NOT NULL DEFAULT 'INTERNAL_REVIEW',
  verified_at TIMESTAMPTZ,
  document_version INTEGER,
  document_checksum TEXT,
  source_reference TEXT,
  session_id TEXT REFERENCES sessions(session_id) ON DELETE RESTRICT,
  source_ip INET,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_verifications_document_fk
    FOREIGN KEY (institution_key, document_id)
    REFERENCES filing_office_documents(institution_key, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT document_verifications_actor_not_blank CHECK (BTRIM(verifier_actor_id) <> ''),
  CONSTRAINT document_verifications_status_check CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED', 'SUPERSEDED')),
  CONSTRAINT document_verifications_method_not_blank CHECK (BTRIM(verification_method) <> ''),
  CONSTRAINT document_verifications_version_check CHECK (document_version IS NULL OR document_version > 0),
  CONSTRAINT document_verifications_findings_object CHECK (jsonb_typeof(findings) = 'object'),
  CONSTRAINT document_verifications_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT document_verifications_verified_consistency CHECK (
    (status = 'VERIFIED' AND verified_at IS NOT NULL)
    OR status <> 'VERIFIED'
  )
);

CREATE TABLE IF NOT EXISTS submission_documents (
  submission_document_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_version INTEGER NOT NULL CHECK (document_version > 0),
  checksum TEXT NOT NULL,
  manifest_order INTEGER NOT NULL DEFAULT 0 CHECK (manifest_order >= 0),
  exported_filename TEXT,
  export_storage_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_documents_submission_fk
    FOREIGN KEY (institution_key, submission_id)
    REFERENCES filing_office_submissions(institution_key, submission_id)
    ON DELETE RESTRICT,
  CONSTRAINT submission_documents_document_fk
    FOREIGN KEY (institution_key, document_id)
    REFERENCES filing_office_documents(institution_key, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT submission_documents_checksum_not_blank CHECK (BTRIM(checksum) <> ''),
  CONSTRAINT submission_documents_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, submission_id, document_id, document_version)
);

CREATE TABLE IF NOT EXISTS submission_receipts (
  receipt_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  receipt_type TEXT NOT NULL,
  status TEXT NOT NULL,
  external_reference TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  recorded_by TEXT NOT NULL,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  receipt_document_id TEXT,
  delivery_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  receipt_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_receipts_submission_fk
    FOREIGN KEY (institution_key, submission_id)
    REFERENCES filing_office_submissions(institution_key, submission_id)
    ON DELETE RESTRICT,
  CONSTRAINT submission_receipts_document_fk
    FOREIGN KEY (institution_key, receipt_document_id)
    REFERENCES filing_office_documents(institution_key, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT submission_receipts_type_check CHECK (receipt_type IN ('DELIVERY_CONFIRMATION', 'RECEIPT', 'RETURN', 'ACCEPTANCE', 'REJECTION')),
  CONSTRAINT submission_receipts_status_check CHECK (status IN ('RECORDED', 'VERIFIED', 'DISPUTED', 'SUPERSEDED')),
  CONSTRAINT submission_receipts_recorded_by_not_blank CHECK (BTRIM(recorded_by) <> ''),
  CONSTRAINT submission_receipts_delivery_evidence_object CHECK (jsonb_typeof(delivery_evidence) = 'object'),
  CONSTRAINT submission_receipts_data_object CHECK (jsonb_typeof(receipt_data) = 'object'),
  CONSTRAINT submission_receipts_verification_consistency CHECK (
    (status = 'VERIFIED' AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
    OR status <> 'VERIFIED'
  )
);

CREATE INDEX IF NOT EXISTS filing_package_requirements_package_status_idx
  ON filing_package_requirements (institution_key, package_id, status, display_order);

CREATE INDEX IF NOT EXISTS filing_package_requirements_missing_idx
  ON filing_package_requirements (institution_key, package_id, document_type)
  WHERE status = 'MISSING';

CREATE INDEX IF NOT EXISTS document_signatures_document_status_idx
  ON document_signatures (institution_key, document_id, status, signed_at DESC);

CREATE INDEX IF NOT EXISTS document_signatures_signer_idx
  ON document_signatures (institution_key, signer_actor_id, signed_at DESC);

CREATE INDEX IF NOT EXISTS document_verifications_document_status_idx
  ON document_verifications (institution_key, document_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS document_verifications_verifier_idx
  ON document_verifications (institution_key, verifier_actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS submission_documents_submission_order_idx
  ON submission_documents (institution_key, submission_id, manifest_order);

CREATE INDEX IF NOT EXISTS submission_receipts_submission_time_idx
  ON submission_receipts (institution_key, submission_id, received_at DESC);

CREATE INDEX IF NOT EXISTS submission_receipts_reference_idx
  ON submission_receipts (external_reference)
  WHERE external_reference IS NOT NULL;

INSERT INTO filing_package_requirements (
  requirement_id,
  institution_key,
  package_id,
  document_type,
  requirement_kind,
  status,
  display_order,
  satisfied_document_id,
  satisfied_at,
  metadata
)
SELECT
  package_row.institution_key || ':' || package_row.package_id || ':required:' || requirement.document_type,
  package_row.institution_key,
  package_row.package_id,
  requirement.document_type,
  'REQUIRED',
  CASE
    WHEN matched_document.document_id IS NULL THEN 'MISSING'
    WHEN matched_document.status = 'SUBMITTED' THEN 'SUBMITTED'
    WHEN matched_document.status = 'VERIFIED' THEN 'VERIFIED'
    WHEN matched_document.status = 'SIGNED' THEN 'SIGNED'
    ELSE 'PRESENT'
  END,
  requirement.ordinality - 1,
  matched_document.document_id,
  CASE WHEN matched_document.document_id IS NOT NULL THEN matched_document.updated_at END,
  jsonb_build_object('migratedFrom', 'filing_office_packages.requiredDocumentTypes')
FROM filing_office_packages AS package_row
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(package_row.package_data -> 'requiredDocumentTypes', '[]'::jsonb)
) WITH ORDINALITY AS requirement(document_type, ordinality)
LEFT JOIN LATERAL (
  SELECT document_id, status, updated_at
  FROM filing_office_documents
  WHERE institution_key = package_row.institution_key
    AND package_id = package_row.package_id
    AND document_type = requirement.document_type
  ORDER BY document_order ASC
  LIMIT 1
) AS matched_document ON TRUE
ON CONFLICT (institution_key, package_id, document_type, requirement_kind) DO NOTHING;

INSERT INTO filing_package_requirements (
  requirement_id,
  institution_key,
  package_id,
  document_type,
  requirement_kind,
  status,
  display_order,
  satisfied_document_id,
  satisfied_at,
  metadata
)
SELECT
  package_row.institution_key || ':' || package_row.package_id || ':conditional:' || requirement.document_type,
  package_row.institution_key,
  package_row.package_id,
  requirement.document_type,
  'CONDITIONAL',
  CASE
    WHEN matched_document.document_id IS NULL THEN 'MISSING'
    WHEN matched_document.status = 'SUBMITTED' THEN 'SUBMITTED'
    WHEN matched_document.status = 'VERIFIED' THEN 'VERIFIED'
    WHEN matched_document.status = 'SIGNED' THEN 'SIGNED'
    ELSE 'PRESENT'
  END,
  requirement.ordinality - 1,
  matched_document.document_id,
  CASE WHEN matched_document.document_id IS NOT NULL THEN matched_document.updated_at END,
  jsonb_build_object('migratedFrom', 'filing_office_packages.conditionalDocumentTypes')
FROM filing_office_packages AS package_row
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(package_row.package_data -> 'conditionalDocumentTypes', '[]'::jsonb)
) WITH ORDINALITY AS requirement(document_type, ordinality)
LEFT JOIN LATERAL (
  SELECT document_id, status, updated_at
  FROM filing_office_documents
  WHERE institution_key = package_row.institution_key
    AND package_id = package_row.package_id
    AND document_type = requirement.document_type
  ORDER BY document_order ASC
  LIMIT 1
) AS matched_document ON TRUE
ON CONFLICT (institution_key, package_id, document_type, requirement_kind) DO NOTHING;

INSERT INTO document_signatures (
  signature_id,
  institution_key,
  document_id,
  signer_actor_id,
  signature_method,
  status,
  signed_at,
  metadata
)
SELECT
  institution_key || ':' || document_id || ':legacy-signature',
  institution_key,
  document_id,
  signed_by,
  'LEGACY_STATUS_MIGRATION',
  'RECORDED',
  updated_at,
  jsonb_build_object('migratedFrom', 'filing_office_documents.signed_by')
FROM filing_office_documents
WHERE signed_by IS NOT NULL
ON CONFLICT (signature_id) DO NOTHING;

INSERT INTO document_verifications (
  verification_id,
  institution_key,
  document_id,
  verifier_actor_id,
  status,
  verification_method,
  verified_at,
  metadata
)
SELECT
  institution_key || ':' || document_id || ':legacy-verification',
  institution_key,
  document_id,
  verified_by,
  'VERIFIED',
  'LEGACY_STATUS_MIGRATION',
  updated_at,
  jsonb_build_object('migratedFrom', 'filing_office_documents.verified_by')
FROM filing_office_documents
WHERE verified_by IS NOT NULL
ON CONFLICT (verification_id) DO NOTHING;

INSERT INTO submission_documents (
  submission_document_id,
  institution_key,
  submission_id,
  document_id,
  document_version,
  checksum,
  manifest_order,
  metadata
)
SELECT
  submission_row.institution_key || ':' || submission_row.submission_id || ':' || manifest_item.item ->> 'documentId' || ':' || COALESCE(manifest_item.item ->> 'version', '1'),
  submission_row.institution_key,
  submission_row.submission_id,
  manifest_item.item ->> 'documentId',
  COALESCE((manifest_item.item ->> 'version')::integer, 1),
  manifest_item.item ->> 'checksum',
  manifest_item.ordinality - 1,
  jsonb_build_object('migratedFrom', 'filing_office_submissions.manifest')
FROM filing_office_submissions AS submission_row
CROSS JOIN LATERAL jsonb_array_elements(submission_row.manifest)
  WITH ORDINALITY AS manifest_item(item, ordinality)
JOIN filing_office_documents AS document_row
  ON document_row.institution_key = submission_row.institution_key
 AND document_row.document_id = manifest_item.item ->> 'documentId'
WHERE NULLIF(manifest_item.item ->> 'checksum', '') IS NOT NULL
ON CONFLICT (institution_key, submission_id, document_id, document_version) DO NOTHING;

COMMENT ON TABLE filing_package_requirements IS
  'Visible required and conditional document checklist for each filing package.';
COMMENT ON TABLE document_signatures IS
  'Durable signature evidence linked to the exact filing document and optional user, authority, and session.';
COMMENT ON TABLE document_verifications IS
  'Independent document-verification records separated from document preparation and signature state.';
COMMENT ON TABLE submission_documents IS
  'Normalized submission manifest entries linking exported document versions and checksums to a submission.';
COMMENT ON TABLE submission_receipts IS
  'Delivery, receipt, return, acceptance, and rejection evidence associated with a filing submission.';

COMMIT;
