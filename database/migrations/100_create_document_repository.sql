BEGIN;

CREATE TABLE IF NOT EXISTS repository_documents (
  document_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  created_by TEXT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL REFERENCES users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS repository_documents_institution_updated_idx
  ON repository_documents (institution_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS repository_documents_search_idx
  ON repository_documents USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(document_type, ''))
  );

CREATE TABLE IF NOT EXISTS repository_document_blobs (
  blob_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  content BYTEA NOT NULL,
  byte_length BIGINT NOT NULL CHECK (byte_length >= 0),
  checksum_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, checksum_sha256, byte_length)
);

CREATE TABLE IF NOT EXISTS repository_document_versions (
  document_version_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES repository_documents(document_id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  blob_id UUID NOT NULL REFERENCES repository_document_blobs(blob_id) ON DELETE RESTRICT,
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  byte_length BIGINT NOT NULL CHECK (byte_length >= 0),
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  frozen_at TIMESTAMPTZ,
  frozen_by TEXT REFERENCES users(user_id),
  signed_at TIMESTAMPTZ,
  signature_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (institution_key, document_id, version_number)
);

CREATE INDEX IF NOT EXISTS repository_document_versions_document_idx
  ON repository_document_versions (institution_key, document_id, version_number DESC);
CREATE INDEX IF NOT EXISTS repository_document_versions_checksum_idx
  ON repository_document_versions (institution_key, checksum_sha256);

CREATE TABLE IF NOT EXISTS repository_document_events (
  event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES repository_documents(document_id) ON DELETE RESTRICT,
  document_version_id UUID REFERENCES repository_document_versions(document_version_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(user_id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_ip INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS repository_document_events_document_idx
  ON repository_document_events (institution_key, document_id, occurred_at DESC);

COMMIT;
