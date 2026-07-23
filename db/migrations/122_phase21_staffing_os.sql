CREATE TABLE IF NOT EXISTS staffing_profiles (
  staffing_profile_id UUID PRIMARY KEY,
  agency_name TEXT NOT NULL,
  business_email TEXT NOT NULL UNIQUE,
  recruiter_count TEXT NOT NULL,
  locations TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staffing_assignments (
  staffing_assignment_id UUID PRIMARY KEY,
  staffing_profile_id UUID NOT NULL REFERENCES staffing_profiles(staffing_profile_id) ON DELETE CASCADE,
  application_id UUID NOT NULL UNIQUE REFERENCES job_applications(application_id) ON DELETE CASCADE,
  recruiter_note TEXT,
  placement_status TEXT NOT NULL DEFAULT 'NEW' CHECK (placement_status IN ('NEW', 'MATCHED', 'SCREENING', 'SUBMITTED', 'INTERVIEW', 'OFFERED', 'PLACED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staffing_profiles_email_idx ON staffing_profiles(business_email);
CREATE INDEX IF NOT EXISTS staffing_assignments_profile_idx ON staffing_assignments(staffing_profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS staffing_assignments_status_idx ON staffing_assignments(placement_status, updated_at DESC);
