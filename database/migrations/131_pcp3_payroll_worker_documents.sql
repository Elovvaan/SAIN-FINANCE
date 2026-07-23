CREATE TABLE IF NOT EXISTS payroll_workers (
  payroll_worker_id UUID PRIMARY KEY,
  employer_id UUID NOT NULL REFERENCES employer_profiles(employer_id) ON DELETE CASCADE,
  career_profile_id UUID NOT NULL REFERENCES career_profiles(career_profile_id) ON DELETE CASCADE,
  employment_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (employment_status IN ('ACTIVE', 'INACTIVE', 'TERMINATED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employer_id, career_profile_id)
);

CREATE TABLE IF NOT EXISTS payroll_line_items (
  payroll_line_item_id UUID PRIMARY KEY,
  payroll_record_id UUID NOT NULL REFERENCES employer_payroll_records(payroll_record_id) ON DELETE CASCADE,
  payroll_worker_id UUID NOT NULL REFERENCES payroll_workers(payroll_worker_id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED', 'APPROVED', 'PROCESSING', 'PAID', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_events (
  payroll_event_id UUID PRIMARY KEY,
  payroll_record_id UUID REFERENCES employer_payroll_records(payroll_record_id) ON DELETE CASCADE,
  payroll_worker_id UUID REFERENCES payroll_workers(payroll_worker_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED', 'APPROVED', 'FUNDED', 'PROCESSING', 'PAID', 'CORRECTION_OPENED', 'CORRECTION_RESOLVED')),
  title TEXT NOT NULL,
  detail TEXT,
  actor_identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_documents (
  worker_document_id UUID PRIMARY KEY,
  career_profile_id UUID NOT NULL REFERENCES career_profiles(career_profile_id) ON DELETE CASCADE,
  employer_id UUID REFERENCES employer_profiles(employer_id) ON DELETE SET NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('EMPLOYMENT_AGREEMENT', 'OFFER_LETTER', 'W4', 'I9', 'IDENTITY', 'PAY_STATEMENT', 'TAX_FORM', 'HR_DOCUMENT', 'OTHER')),
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  content BYTEA NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'DELETED')),
  version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_document_events (
  document_event_id UUID PRIMARY KEY,
  worker_document_id UUID NOT NULL REFERENCES worker_documents(worker_document_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('UPLOADED', 'REPLACED', 'DOWNLOADED', 'DELETED')),
  actor_identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payroll_workers_profile_idx ON payroll_workers(career_profile_id, employer_id);
CREATE INDEX IF NOT EXISTS payroll_line_items_worker_idx ON payroll_line_items(payroll_worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payroll_line_items_record_idx ON payroll_line_items(payroll_record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payroll_events_worker_idx ON payroll_events(payroll_worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS worker_documents_profile_idx ON worker_documents(career_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS worker_documents_employer_idx ON worker_documents(employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS worker_document_events_document_idx ON worker_document_events(worker_document_id, created_at DESC);