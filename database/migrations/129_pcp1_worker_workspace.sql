CREATE TABLE IF NOT EXISTS worker_support_cases (
  support_case_id UUID PRIMARY KEY,
  career_profile_id UUID NOT NULL REFERENCES career_profiles(career_profile_id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS worker_support_cases_profile_idx
  ON worker_support_cases(career_profile_id, created_at DESC);
