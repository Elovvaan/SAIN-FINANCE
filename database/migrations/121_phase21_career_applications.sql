CREATE TABLE IF NOT EXISTS career_profiles (
  career_profile_id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  career_stage TEXT NOT NULL,
  "current_role" TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_applications (
  application_id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES employer_jobs(job_id) ON DELETE CASCADE,
  career_profile_id UUID NOT NULL REFERENCES career_profiles(career_profile_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'IN_REVIEW', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN')),
  cover_note TEXT,
  resume_filename TEXT NOT NULL,
  resume_media_type TEXT NOT NULL,
  resume_content BYTEA NOT NULL,
  resume_byte_length INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, career_profile_id)
);

CREATE INDEX IF NOT EXISTS career_profiles_email_idx ON career_profiles(email);
CREATE INDEX IF NOT EXISTS job_applications_profile_idx ON job_applications(career_profile_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS job_applications_job_idx ON job_applications(job_id, submitted_at DESC);