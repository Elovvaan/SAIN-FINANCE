BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  notification_type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  status TEXT NOT NULL DEFAULT 'UNREAD',
  related_entity_type TEXT,
  related_entity_id TEXT,
  action_url TEXT,
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notifications_priority_check CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  CONSTRAINT notifications_status_check CHECK (status IN ('UNREAD','READ','ARCHIVED')),
  CONSTRAINT notifications_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, notification_id)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  notification_preference_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notification_preferences_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (institution_key, user_id, category)
);

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  notification_delivery_attempt_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  notification_id UUID NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  provider_reference TEXT,
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notification_delivery_notification_fk FOREIGN KEY (institution_key, notification_id)
    REFERENCES notifications(institution_key, notification_id) ON DELETE RESTRICT,
  CONSTRAINT notification_delivery_channel_check CHECK (channel IN ('IN_APP','EMAIL','SMS','PUSH','WEBHOOK')),
  CONSTRAINT notification_delivery_status_check CHECK (status IN ('PENDING','DELIVERED','FAILED','SUPPRESSED')),
  CONSTRAINT notification_delivery_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS notification_events (
  notification_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  notification_id UUID,
  user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  resulting_status TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_events_notification_fk FOREIGN KEY (institution_key, notification_id)
    REFERENCES notifications(institution_key, notification_id) ON DELETE RESTRICT,
  CONSTRAINT notification_events_data_object CHECK (jsonb_typeof(event_data) = 'object')
);

CREATE INDEX IF NOT EXISTS notifications_recipient_queue_idx
  ON notifications (institution_key, recipient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_entity_idx
  ON notifications (institution_key, related_entity_type, related_entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_delivery_attempts_idx
  ON notification_delivery_attempts (institution_key, notification_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS notification_events_idx
  ON notification_events (institution_key, notification_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_notification_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'NOTIFICATION_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS notification_events_reject_update ON notification_events;
CREATE TRIGGER notification_events_reject_update BEFORE UPDATE ON notification_events
FOR EACH ROW EXECUTE FUNCTION reject_notification_event_mutation();

DROP TRIGGER IF EXISTS notification_events_reject_delete ON notification_events;
CREATE TRIGGER notification_events_reject_delete BEFORE DELETE ON notification_events
FOR EACH ROW EXECUTE FUNCTION reject_notification_event_mutation();

COMMIT;
