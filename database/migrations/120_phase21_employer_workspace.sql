CREATE TABLE IF NOT EXISTS employer_profiles (
  employer_id UUID PRIMARY KEY,
  company_name TEXT NOT NULL,
  business_email TEXT NOT NULL UNIQUE,
  industry TEXT NOT NULL,
  company_size TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employer_jobs (
  job_id UUID PRIMARY KEY,
  employer_id UUID NOT NULL REFERENCES employer_profiles(employer_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employer_jobs_employer_idx ON employer_jobs(employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employer_jobs_status_idx ON employer_jobs(status, created_at DESC);
