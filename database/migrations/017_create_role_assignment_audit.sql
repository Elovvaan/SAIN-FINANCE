BEGIN;

CREATE TABLE IF NOT EXISTS role_assignment_events (
  role_assignment_event_id TEXT PRIMARY KEY,
  institution_key TEXT NOT NULL REFERENCES institutions(institution_key) ON DELETE RESTRICT,
  user_role_id TEXT NOT NULL REFERENCES user_roles(user_role_id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  role_id TEXT NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(session_id) ON DELETE RESTRICT,
  previous_status TEXT,
  resulting_status TEXT NOT NULL,
  effective_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT role_assignment_events_type_check CHECK (
    event_type IN ('ASSIGNED', 'ACTIVATED', 'EXTENDED', 'REVOKED', 'EXPIRED', 'SUPERSEDED')
  ),
  CONSTRAINT role_assignment_events_result_not_blank CHECK (BTRIM(resulting_status) <> ''),
  CONSTRAINT role_assignment_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS user_role_authority_grants (
  user_role_id TEXT NOT NULL REFERENCES user_roles(user_role_id) ON DELETE RESTRICT,
  authority_grant_id TEXT NOT NULL REFERENCES authority_grants(authority_grant_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_role_id, authority_grant_id)
);

CREATE INDEX IF NOT EXISTS role_assignment_events_user_time_idx
  ON role_assignment_events (institution_key, user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS role_assignment_events_role_time_idx
  ON role_assignment_events (institution_key, role_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS role_assignment_events_actor_time_idx
  ON role_assignment_events (institution_key, actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_role_authority_grants_authority_idx
  ON user_role_authority_grants (authority_grant_id);

CREATE OR REPLACE FUNCTION reject_role_assignment_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ROLE_ASSIGNMENT_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS role_assignment_events_reject_update ON role_assignment_events;
CREATE TRIGGER role_assignment_events_reject_update
BEFORE UPDATE ON role_assignment_events
FOR EACH ROW EXECUTE FUNCTION reject_role_assignment_event_mutation();

DROP TRIGGER IF EXISTS role_assignment_events_reject_delete ON role_assignment_events;
CREATE TRIGGER role_assignment_events_reject_delete
BEFORE DELETE ON role_assignment_events
FOR EACH ROW EXECUTE FUNCTION reject_role_assignment_event_mutation();

COMMENT ON TABLE role_assignment_events IS
  'Append-only audit history for role assignment, activation, expiry, extension, revocation, and supersession.';
COMMENT ON TABLE user_role_authority_grants IS
  'Links each role assignment to the authority grants generated from that role permissions.';

COMMIT;
