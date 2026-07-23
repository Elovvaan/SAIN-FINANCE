CREATE TABLE IF NOT EXISTS workflow_definitions (
  workflow_definition_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  workflow_code TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  trigger_type TEXT NOT NULL DEFAULT 'MANUAL',
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, workflow_code, version)
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  workflow_step_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(workflow_definition_id) ON DELETE CASCADE,
  step_code TEXT NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  assigned_role TEXT,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  sla_minutes INTEGER,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, workflow_definition_id, step_code),
  UNIQUE (institution_key, workflow_definition_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS workflow_transitions (
  workflow_transition_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(workflow_definition_id) ON DELETE CASCADE,
  from_step_code TEXT,
  to_step_code TEXT,
  transition_name TEXT NOT NULL,
  condition_expression JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  workflow_instance_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(workflow_definition_id),
  workflow_version INTEGER NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  current_step_code TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_by TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_tasks (
  workflow_task_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(workflow_instance_id) ON DELETE CASCADE,
  workflow_step_id UUID REFERENCES workflow_steps(workflow_step_id),
  step_code TEXT NOT NULL,
  task_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  assigned_user_id TEXT,
  assigned_role TEXT,
  due_at TIMESTAMPTZ,
  task_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_approvals (
  workflow_approval_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  workflow_task_id UUID NOT NULL REFERENCES workflow_tasks(workflow_task_id) ON DELETE CASCADE,
  approval_status TEXT NOT NULL DEFAULT 'PENDING',
  approver_user_id TEXT,
  approver_role TEXT,
  decision_reason TEXT,
  decision_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow_events (
  workflow_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  workflow_instance_id UUID,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_institution_status ON workflow_definitions(institution_key, status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_institution_status ON workflow_instances(institution_key, status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_related_entity ON workflow_instances(institution_key, related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_institution_status ON workflow_tasks(institution_key, status, due_at);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_assigned_user ON workflow_tasks(institution_key, assigned_user_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_events_instance ON workflow_events(institution_key, workflow_instance_id, created_at DESC);