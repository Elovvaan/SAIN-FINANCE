CREATE TABLE IF NOT EXISTS employer_payroll_records (
  payroll_record_id UUID PRIMARY KEY,
  employer_id UUID NOT NULL REFERENCES employer_profiles(employer_id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  pay_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employer_funding_sources (
  funding_source_id UUID PRIMARY KEY,
  employer_id UUID NOT NULL REFERENCES employer_profiles(employer_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employer_disbursements (
  disbursement_id UUID PRIMARY KEY,
  employer_id UUID NOT NULL REFERENCES employer_profiles(employer_id) ON DELETE CASCADE,
  payroll_record_id UUID REFERENCES employer_payroll_records(payroll_record_id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employer_payroll_corrections (
  correction_id UUID PRIMARY KEY,
  employer_id UUID NOT NULL REFERENCES employer_profiles(employer_id) ON DELETE CASCADE,
  application_id UUID REFERENCES job_applications(application_id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employer_payroll_records_employer_idx ON employer_payroll_records(employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employer_funding_sources_employer_idx ON employer_funding_sources(employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employer_disbursements_employer_idx ON employer_disbursements(employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employer_payroll_corrections_employer_idx ON employer_payroll_corrections(employer_id, created_at DESC);