BEGIN;

CREATE TABLE IF NOT EXISTS intelligence_model_configs (
  model_config_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  config_code TEXT NOT NULL,
  config_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INACTIVE',
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  credential_reference TEXT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intelligence_model_status_check CHECK (status IN ('ACTIVE','INACTIVE','DEGRADED','RETIRED')),
  CONSTRAINT intelligence_model_capabilities_array CHECK (jsonb_typeof(capabilities)='array'),
  CONSTRAINT intelligence_model_settings_object CHECK (jsonb_typeof(settings)='object'),
  UNIQUE (institution_key, model_config_id),
  UNIQUE (institution_key, config_code)
);

CREATE TABLE IF NOT EXISTS intelligence_prompt_templates (
  prompt_template_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  template_code TEXT NOT NULL,
  template_name TEXT NOT NULL,
  assistant_type TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  system_instructions TEXT NOT NULL,
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intelligence_prompt_status_check CHECK (status IN ('DRAFT','ACTIVE','INACTIVE','RETIRED')),
  CONSTRAINT intelligence_prompt_schema_object CHECK (jsonb_typeof(input_schema)='object'),
  UNIQUE (institution_key, prompt_template_id),
  UNIQUE (institution_key, template_code, version)
);

CREATE TABLE IF NOT EXISTS intelligence_knowledge_sources (
  knowledge_source_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  source_code TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  source_reference TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_indexed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intelligence_knowledge_status_check CHECK (status IN ('ACTIVE','INACTIVE','INDEXING','FAILED')),
  CONSTRAINT intelligence_knowledge_metadata_object CHECK (jsonb_typeof(metadata)='object'),
  UNIQUE (institution_key, knowledge_source_id),
  UNIQUE (institution_key, source_code)
);

CREATE TABLE IF NOT EXISTS intelligence_conversations (
  conversation_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  assistant_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  context_entity_type TEXT,
  context_entity_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intelligence_conversation_status_check CHECK (status IN ('OPEN','CLOSED','ARCHIVED')),
  UNIQUE (institution_key, conversation_id)
);

CREATE TABLE IF NOT EXISTS intelligence_messages (
  message_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model_config_id UUID,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intelligence_message_conversation_fk FOREIGN KEY (institution_key, conversation_id) REFERENCES intelligence_conversations(institution_key, conversation_id) ON DELETE RESTRICT,
  CONSTRAINT intelligence_message_model_fk FOREIGN KEY (institution_key, model_config_id) REFERENCES intelligence_model_configs(institution_key, model_config_id) ON DELETE RESTRICT,
  CONSTRAINT intelligence_message_role_check CHECK (role IN ('SYSTEM','USER','ASSISTANT','TOOL')),
  CONSTRAINT intelligence_message_citations_array CHECK (jsonb_typeof(citations)='array'),
  CONSTRAINT intelligence_message_usage_object CHECK (jsonb_typeof(token_usage)='object')
);

CREATE TABLE IF NOT EXISTS intelligence_tasks (
  intelligence_task_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  task_type TEXT NOT NULL,
  assistant_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  source_entity_type TEXT,
  source_entity_id TEXT,
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(6,5),
  explanation TEXT,
  assigned_model_config_id UUID,
  requested_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT intelligence_task_model_fk FOREIGN KEY (institution_key, assigned_model_config_id) REFERENCES intelligence_model_configs(institution_key, model_config_id) ON DELETE RESTRICT,
  CONSTRAINT intelligence_task_status_check CHECK (status IN ('QUEUED','PROCESSING','COMPLETED','FAILED','REVIEW_REQUIRED','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT intelligence_task_priority_check CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  CONSTRAINT intelligence_task_input_object CHECK (jsonb_typeof(input_data)='object'),
  CONSTRAINT intelligence_task_output_object CHECK (jsonb_typeof(output_data)='object'),
  CONSTRAINT intelligence_task_confidence_check CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  UNIQUE (institution_key, intelligence_task_id)
);

CREATE TABLE IF NOT EXISTS intelligence_recommendations (
  recommendation_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  intelligence_task_id UUID,
  recommendation_type TEXT NOT NULL,
  title TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  confidence_score NUMERIC(6,5),
  source_entity_type TEXT,
  source_entity_id TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_by_model TEXT,
  created_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  resolved_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT intelligence_recommendation_task_fk FOREIGN KEY (institution_key, intelligence_task_id) REFERENCES intelligence_tasks(institution_key, intelligence_task_id) ON DELETE RESTRICT,
  CONSTRAINT intelligence_recommendation_status_check CHECK (status IN ('OPEN','ACCEPTED','DISMISSED','IMPLEMENTED','EXPIRED')),
  CONSTRAINT intelligence_recommendation_severity_check CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT intelligence_recommendation_evidence_array CHECK (jsonb_typeof(evidence)='array'),
  CONSTRAINT intelligence_recommendation_confidence_check CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  UNIQUE (institution_key, recommendation_id)
);

CREATE TABLE IF NOT EXISTS intelligence_events (
  intelligence_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intelligence_event_data_object CHECK (jsonb_typeof(event_data)='object')
);

CREATE INDEX IF NOT EXISTS intelligence_models_lookup_idx ON intelligence_model_configs (institution_key,status,provider);
CREATE INDEX IF NOT EXISTS intelligence_prompts_lookup_idx ON intelligence_prompt_templates (institution_key,assistant_type,status);
CREATE INDEX IF NOT EXISTS intelligence_knowledge_lookup_idx ON intelligence_knowledge_sources (institution_key,status,source_type);
CREATE INDEX IF NOT EXISTS intelligence_conversations_lookup_idx ON intelligence_conversations (institution_key,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_messages_conversation_idx ON intelligence_messages (institution_key,conversation_id,created_at);
CREATE INDEX IF NOT EXISTS intelligence_tasks_queue_idx ON intelligence_tasks (institution_key,status,priority,created_at);
CREATE INDEX IF NOT EXISTS intelligence_recommendations_open_idx ON intelligence_recommendations (institution_key,status,severity,created_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_events_entity_idx ON intelligence_events (institution_key,entity_type,entity_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_intelligence_event_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'INTELLIGENCE_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS intelligence_events_reject_update ON intelligence_events;
CREATE TRIGGER intelligence_events_reject_update BEFORE UPDATE ON intelligence_events FOR EACH ROW EXECUTE FUNCTION reject_intelligence_event_mutation();
DROP TRIGGER IF EXISTS intelligence_events_reject_delete ON intelligence_events;
CREATE TRIGGER intelligence_events_reject_delete BEFORE DELETE ON intelligence_events FOR EACH ROW EXECUTE FUNCTION reject_intelligence_event_mutation();

COMMIT;