CREATE TABLE IF NOT EXISTS api_clients (
  api_client_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_code TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  client_type TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
  redirect_uris JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_origins JSONB NOT NULL DEFAULT '[]'::jsonb,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, client_code)
);

CREATE TABLE IF NOT EXISTS api_credentials (
  api_credential_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  api_client_id UUID NOT NULL REFERENCES api_clients(api_client_id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,
  public_identifier TEXT NOT NULL,
  secret_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (institution_key, public_identifier)
);

CREATE TABLE IF NOT EXISTS api_products (
  api_product_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  description TEXT,
  base_path TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  default_rate_limit INTEGER NOT NULL DEFAULT 1000,
  documentation_url TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, product_code, version)
);

CREATE TABLE IF NOT EXISTS api_client_products (
  api_client_product_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  api_client_id UUID NOT NULL REFERENCES api_clients(api_client_id) ON DELETE CASCADE,
  api_product_id UUID NOT NULL REFERENCES api_products(api_product_id) ON DELETE CASCADE,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  rate_limit INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, api_client_id, api_product_id)
);

CREATE TABLE IF NOT EXISTS api_webhooks (
  api_webhook_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  api_client_id UUID NOT NULL REFERENCES api_clients(api_client_id) ON DELETE CASCADE,
  webhook_name TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  event_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  signing_secret_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_delivery_at TIMESTAMPTZ,
  last_delivery_status TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_request_logs (
  api_request_log_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  api_client_id UUID REFERENCES api_clients(api_client_id),
  api_product_id UUID REFERENCES api_products(api_product_id),
  request_id TEXT NOT NULL,
  http_method TEXT NOT NULL,
  request_path TEXT NOT NULL,
  response_status INTEGER,
  duration_ms INTEGER,
  source_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_key, request_id)
);

CREATE TABLE IF NOT EXISTS api_events (
  api_event_id UUID PRIMARY KEY,
  institution_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_clients_institution_status ON api_clients(institution_key, status, client_name);
CREATE INDEX IF NOT EXISTS idx_api_credentials_client_status ON api_credentials(institution_key, api_client_id, status);
CREATE INDEX IF NOT EXISTS idx_api_products_institution_status ON api_products(institution_key, status, product_code);
CREATE INDEX IF NOT EXISTS idx_api_client_products_client ON api_client_products(institution_key, api_client_id, status);
CREATE INDEX IF NOT EXISTS idx_api_webhooks_client_status ON api_webhooks(institution_key, api_client_id, status);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created ON api_request_logs(institution_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_events_entity ON api_events(institution_key, entity_type, entity_id, created_at DESC);
