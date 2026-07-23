CREATE TABLE IF NOT EXISTS portal_profiles (
  portal_profile_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  party_id UUID,
  user_id UUID,
  portal_role TEXT NOT NULL CHECK (portal_role IN ('BORROWER','BROKER','REALTOR','BUILDER','ATTORNEY_TITLE','INVESTOR')),
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','DISABLED')),
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_login_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, user_id, portal_role)
);

CREATE INDEX IF NOT EXISTS idx_portal_profiles_institution_role
  ON portal_profiles (institution_key, portal_role, status);

CREATE TABLE IF NOT EXISTS portal_relationships (
  portal_relationship_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  portal_profile_id UUID NOT NULL REFERENCES portal_profiles(portal_profile_id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, portal_profile_id, entity_type, entity_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_portal_relationships_entity
  ON portal_relationships (institution_key, entity_type, entity_id, status);

CREATE TABLE IF NOT EXISTS portal_conversations (
  portal_conversation_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  conversation_type TEXT NOT NULL DEFAULT 'GENERAL',
  related_entity_type TEXT,
  related_entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','ARCHIVED')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_conversations_entity
  ON portal_conversations (institution_key, related_entity_type, related_entity_id, status);

CREATE TABLE IF NOT EXISTS portal_conversation_participants (
  portal_conversation_id UUID NOT NULL REFERENCES portal_conversations(portal_conversation_id) ON DELETE CASCADE,
  institution_key TEXT NOT NULL,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('PORTAL_PROFILE','OPERATOR')),
  participant_id TEXT NOT NULL,
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (portal_conversation_id, participant_type, participant_id)
);

CREATE TABLE IF NOT EXISTS portal_messages (
  portal_message_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  portal_conversation_id UUID NOT NULL REFERENCES portal_conversations(portal_conversation_id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('PORTAL_PROFILE','OPERATOR','SYSTEM','AI')),
  sender_id TEXT,
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_messages_conversation
  ON portal_messages (institution_key, portal_conversation_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS portal_notifications (
  portal_notification_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  portal_profile_id UUID NOT NULL REFERENCES portal_profiles(portal_profile_id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status TEXT NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD','READ','DISMISSED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_profile
  ON portal_notifications (institution_key, portal_profile_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS portal_document_shares (
  portal_document_share_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  document_id TEXT NOT NULL,
  portal_profile_id UUID NOT NULL REFERENCES portal_profiles(portal_profile_id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'VIEW' CHECK (access_level IN ('VIEW','DOWNLOAD','UPLOAD_REPLACEMENT','SIGN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  expires_at TIMESTAMPTZ,
  shared_by TEXT NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (institution_key, document_id, portal_profile_id, access_level)
);

CREATE TABLE IF NOT EXISTS portal_requests (
  portal_request_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  portal_profile_id UUID NOT NULL REFERENCES portal_profiles(portal_profile_id),
  request_type TEXT NOT NULL CHECK (request_type IN ('DOCUMENT','DRAW','INSPECTION','PAYMENT','CLOSING','SUBMISSION','SUPPORT','OTHER')),
  related_entity_type TEXT,
  related_entity_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT','SUBMITTED','IN_REVIEW','APPROVED','REJECTED','COMPLETED','CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  assigned_to TEXT,
  due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_requests_workspace
  ON portal_requests (institution_key, portal_profile_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS portal_sessions (
  portal_session_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  portal_profile_id UUID NOT NULL REFERENCES portal_profiles(portal_profile_id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  device_name TEXT,
  ip_address INET,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE (institution_key, session_hash)
);

CREATE TABLE IF NOT EXISTS portal_events (
  portal_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('PORTAL_PROFILE','OPERATOR','SYSTEM','AI')),
  actor_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_events_entity
  ON portal_events (institution_key, entity_type, entity_id, created_at DESC);
