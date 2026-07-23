CREATE TABLE IF NOT EXISTS job_status_events (
  job_status_event_id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES employer_jobs(job_id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL CHECK (new_status IN ('DRAFT', 'PUBLISHED', 'CLOSED')),
  actor_workspace TEXT NOT NULL CHECK (actor_workspace IN ('EMPLOYER', 'SYSTEM')),
  actor_identifier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_status_events_job_idx
  ON job_status_events(job_id, created_at DESC);
