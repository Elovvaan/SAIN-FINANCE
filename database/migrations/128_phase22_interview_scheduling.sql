CREATE TABLE IF NOT EXISTS application_interviews (
  interview_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES job_applications(application_id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'INITIAL',
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  format TEXT NOT NULL DEFAULT 'VIRTUAL',
  location TEXT,
  meeting_url TEXT,
  interviewer_name TEXT,
  notes TEXT,
  created_by_workspace TEXT NOT NULL,
  created_by_identifier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT application_interviews_stage_check
    CHECK (stage IN ('INITIAL', 'SCREENING', 'TECHNICAL', 'PANEL', 'FINAL')),
  CONSTRAINT application_interviews_status_check
    CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  CONSTRAINT application_interviews_format_check
    CHECK (format IN ('VIRTUAL', 'PHONE', 'IN_PERSON')),
  CONSTRAINT application_interviews_duration_check
    CHECK (duration_minutes BETWEEN 5 AND 480),
  CONSTRAINT application_interviews_workspace_check
    CHECK (created_by_workspace IN ('EMPLOYER', 'STAFFING'))
);

CREATE INDEX IF NOT EXISTS application_interviews_application_idx
  ON application_interviews(application_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS application_interviews_schedule_idx
  ON application_interviews(status, scheduled_at ASC);
