BEGIN;

CREATE TABLE IF NOT EXISTS admin_branches (
  branch_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  timezone TEXT NOT NULL DEFAULT 'America/Denver',
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_branches_status_check CHECK (status IN ('ACTIVE','INACTIVE','CLOSED')),
  CONSTRAINT admin_branches_address_object CHECK (jsonb_typeof(address)='object'),
  UNIQUE (institution_key, branch_id),
  UNIQUE (institution_key, branch_code)
);

CREATE TABLE IF NOT EXISTS admin_roles (
  role_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  role_code TEXT NOT NULL,
  role_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_limit NUMERIC(20,2),
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_roles_status_check CHECK (status IN ('ACTIVE','INACTIVE')),
  CONSTRAINT admin_roles_permissions_array CHECK (jsonb_typeof(permissions)='array'),
  UNIQUE (institution_key, role_id),
  UNIQUE (institution_key, role_code)
);

CREATE TABLE IF NOT EXISTS admin_user_assignments (
  assignment_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  role_id UUID NOT NULL,
  branch_id UUID,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  assigned_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_assignment_role_fk FOREIGN KEY (institution_key, role_id) REFERENCES admin_roles(institution_key, role_id) ON DELETE RESTRICT,
  CONSTRAINT admin_assignment_branch_fk FOREIGN KEY (institution_key, branch_id) REFERENCES admin_branches(institution_key, branch_id) ON DELETE RESTRICT,
  CONSTRAINT admin_assignment_status_check CHECK (status IN ('ACTIVE','INACTIVE','EXPIRED')),
  UNIQUE (institution_key, user_id, role_id, branch_id)
);

CREATE TABLE IF NOT EXISTS admin_loan_products (
  loan_product_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  min_amount NUMERIC(20,2),
  max_amount NUMERIC(20,2),
  min_rate NUMERIC(9,6),
  max_rate NUMERIC(9,6),
  min_term_months INTEGER,
  max_term_months INTEGER,
  fee_schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_products_status_check CHECK (status IN ('DRAFT','ACTIVE','INACTIVE','RETIRED')),
  CONSTRAINT admin_products_amount_check CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount),
  CONSTRAINT admin_products_rate_check CHECK (min_rate IS NULL OR max_rate IS NULL OR min_rate <= max_rate),
  CONSTRAINT admin_products_term_check CHECK (min_term_months IS NULL OR max_term_months IS NULL OR min_term_months <= max_term_months),
  CONSTRAINT admin_products_fee_object CHECK (jsonb_typeof(fee_schedule)='object'),
  CONSTRAINT admin_products_policy_object CHECK (jsonb_typeof(policy_rules)='object'),
  UNIQUE (institution_key, loan_product_id),
  UNIQUE (institution_key, product_code)
);

CREATE TABLE IF NOT EXISTS admin_workflows (
  workflow_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  workflow_code TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  module TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_workflows_status_check CHECK (status IN ('DRAFT','ACTIVE','INACTIVE','RETIRED')),
  CONSTRAINT admin_workflows_definition_object CHECK (jsonb_typeof(definition)='object'),
  UNIQUE (institution_key, workflow_id),
  UNIQUE (institution_key, workflow_code, version)
);

CREATE TABLE IF NOT EXISTS admin_settings (
  setting_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, setting_key)
);

CREATE TABLE IF NOT EXISTS admin_events (
  admin_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_events_data_object CHECK (jsonb_typeof(event_data)='object')
);

CREATE INDEX IF NOT EXISTS admin_branches_lookup_idx ON admin_branches (institution_key,status,branch_code);
CREATE INDEX IF NOT EXISTS admin_roles_lookup_idx ON admin_roles (institution_key,status,role_code);
CREATE INDEX IF NOT EXISTS admin_assignments_user_idx ON admin_user_assignments (institution_key,user_id,status);
CREATE INDEX IF NOT EXISTS admin_products_lookup_idx ON admin_loan_products (institution_key,status,product_code);
CREATE INDEX IF NOT EXISTS admin_workflows_lookup_idx ON admin_workflows (institution_key,module,status);
CREATE INDEX IF NOT EXISTS admin_events_entity_idx ON admin_events (institution_key,entity_type,entity_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_admin_event_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ADMIN_EVENT_HISTORY_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS admin_events_reject_update ON admin_events;
CREATE TRIGGER admin_events_reject_update BEFORE UPDATE ON admin_events FOR EACH ROW EXECUTE FUNCTION reject_admin_event_mutation();
DROP TRIGGER IF EXISTS admin_events_reject_delete ON admin_events;
CREATE TRIGGER admin_events_reject_delete BEFORE DELETE ON admin_events FOR EACH ROW EXECUTE FUNCTION reject_admin_event_mutation();

COMMIT;