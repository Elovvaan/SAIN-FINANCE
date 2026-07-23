ALTER TABLE job_applications
  DROP CONSTRAINT IF EXISTS job_applications_status_check;

ALTER TABLE job_applications
  ADD CONSTRAINT job_applications_status_check
  CHECK (status IN (
    'SUBMITTED',
    'IN_REVIEW',
    'INTERVIEW',
    'OFFERED',
    'HIRED',
    'REJECTED',
    'WITHDRAWN'
  ));

CREATE TABLE IF NOT EXISTS application_status_events (
  status_event_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES job_applications(application_id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  actor_workspace TEXT NOT NULL CHECK (actor_workspace IN ('CAREER', 'EMPLOYER', 'STAFFING', 'SYSTEM')),
  actor_identifier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS application_status_events_application_idx
  ON application_status_events(application_id, created_at DESC);
