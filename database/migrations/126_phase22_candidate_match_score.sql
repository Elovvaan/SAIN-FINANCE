ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS match_score INTEGER NOT NULL DEFAULT 0
  CHECK (match_score >= 0 AND match_score <= 100);

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS match_summary TEXT;

CREATE INDEX IF NOT EXISTS job_applications_match_score_idx
  ON job_applications(match_score DESC, submitted_at DESC);
