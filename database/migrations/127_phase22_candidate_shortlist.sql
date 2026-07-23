ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS shortlist_status TEXT NOT NULL DEFAULT 'UNREVIEWED';

ALTER TABLE job_applications
  DROP CONSTRAINT IF EXISTS job_applications_shortlist_status_check;

ALTER TABLE job_applications
  ADD CONSTRAINT job_applications_shortlist_status_check
  CHECK (shortlist_status IN ('UNREVIEWED', 'SHORTLISTED', 'PASSED'));

CREATE INDEX IF NOT EXISTS job_applications_shortlist_idx
  ON job_applications(shortlist_status, match_score DESC, submitted_at DESC);
