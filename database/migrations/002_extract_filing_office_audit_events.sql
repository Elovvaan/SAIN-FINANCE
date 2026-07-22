BEGIN;

CREATE TABLE IF NOT EXISTS filing_office_audit_events (
  institution_key text NOT NULL,
  event_id uuid NOT NULL,
  actor_id text NOT NULL,
  operation text NOT NULL,
  target_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  previous_state text,
  resulting_state text,
  authority_id text,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (institution_key, event_id),
  CONSTRAINT filing_office_audit_events_state_fk
    FOREIGN KEY (institution_key)
    REFERENCES filing_office_state (institution_key)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS filing_office_audit_events_timeline_idx
  ON filing_office_audit_events (institution_key, occurred_at, event_id);

CREATE INDEX IF NOT EXISTS filing_office_audit_events_target_idx
  ON filing_office_audit_events (institution_key, target_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS filing_office_audit_events_actor_idx
  ON filing_office_audit_events (institution_key, actor_id, occurred_at DESC);

INSERT INTO filing_office_audit_events (
  institution_key,
  event_id,
  actor_id,
  operation,
  target_id,
  occurred_at,
  previous_state,
  resulting_state,
  authority_id,
  event
)
SELECT
  state_row.institution_key,
  (audit_event->>'id')::uuid,
  audit_event->>'actorId',
  audit_event->>'operation',
  audit_event->>'targetId',
  (audit_event->>'at')::timestamptz,
  audit_event->>'previousState',
  audit_event->>'resultingState',
  audit_event->>'authorityId',
  audit_event
FROM filing_office_state AS state_row
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(state_row.state->'audit', '[]'::jsonb)
) AS audit_event
ON CONFLICT (institution_key, event_id) DO NOTHING;

UPDATE filing_office_state
SET state = jsonb_set(state, '{audit}', '[]'::jsonb, true),
    updated_at = NOW()
WHERE jsonb_array_length(COALESCE(state->'audit', '[]'::jsonb)) > 0;

COMMIT;
