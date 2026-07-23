CREATE TABLE IF NOT EXISTS application_timeline_events (
  timeline_event_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES job_applications(application_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'NOTE',
    'STATUS',
    'INTERVIEW',
    'PLACEMENT',
    'SYSTEM'
  )),
  actor_workspace TEXT NOT NULL CHECK (actor_workspace IN ('CAREER', 'EMPLOYER', 'STAFFING', 'SYSTEM')),
  actor_identifier TEXT,
  visibility TEXT NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL', 'SHARED', 'APPLICANT')),
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS application_timeline_events_application_idx
  ON application_timeline_events(application_id, created_at DESC);

INSERT INTO application_timeline_events (
  timeline_event_id,
  application_id,
  event_type,
  actor_workspace,
  actor_identifier,
  visibility,
  title,
  body,
  metadata,
  created_at
)
SELECT
  gen_random_uuid(),
  e.application_id,
  'STATUS',
  e.actor_workspace,
  e.actor_identifier,
  'SHARED',
  'Application status changed',
  CASE
    WHEN e.previous_status IS NULL THEN 'Application moved to ' || e.new_status
    ELSE 'Application moved from ' || e.previous_status || ' to ' || e.new_status
  END,
  jsonb_build_object(
    'previousStatus', e.previous_status,
    'newStatus', e.new_status,
    'sourceEventId', e.status_event_id
  ),
  e.created_at
FROM application_status_events e
WHERE NOT EXISTS (
  SELECT 1
  FROM application_timeline_events t
  WHERE t.metadata ->> 'sourceEventId' = e.status_event_id::text
);
