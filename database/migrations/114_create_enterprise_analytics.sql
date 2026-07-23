BEGIN;

CREATE TABLE analytics_dashboards (
  analytics_dashboard_id uuid PRIMARY KEY,
  institution_key text NOT NULL,
  dashboard_code text NOT NULL,
  dashboard_name text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('EXECUTIVE','BOARD','RISK','TREASURY','LENDING','SERVICING','COMPLIANCE','OPERATIONS')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  description text,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_key,dashboard_code)
);

CREATE TABLE analytics_metrics (
  analytics_metric_id uuid PRIMARY KEY,
  institution_key text NOT NULL,
  metric_code text NOT NULL,
  metric_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('PORTFOLIO','LIQUIDITY','PROFITABILITY','DELINQUENCY','CHARGE_OFF','RISK','COMPLIANCE','PRODUCTIVITY','CUSTOMER','CAPITAL')),
  unit text NOT NULL DEFAULT 'NUMBER',
  aggregation text NOT NULL DEFAULT 'SUM' CHECK (aggregation IN ('SUM','AVERAGE','COUNT','MIN','MAX','RATIO','LATEST')),
  source_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_value numeric,
  warning_threshold numeric,
  critical_threshold numeric,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_key,metric_code)
);

CREATE TABLE analytics_metric_values (
  analytics_metric_value_id uuid PRIMARY KEY,
  institution_key text NOT NULL,
  analytics_metric_id uuid NOT NULL REFERENCES analytics_metrics(analytics_metric_id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  dimension_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  metric_value numeric NOT NULL,
  comparison_value numeric,
  status text NOT NULL DEFAULT 'FINAL' CHECK (status IN ('PRELIMINARY','FINAL','RESTATED')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  UNIQUE (institution_key,analytics_metric_id,period_start,period_end,dimension_values)
);

CREATE TABLE analytics_dashboard_widgets (
  analytics_dashboard_widget_id uuid PRIMARY KEY,
  institution_key text NOT NULL,
  analytics_dashboard_id uuid NOT NULL REFERENCES analytics_dashboards(analytics_dashboard_id),
  analytics_metric_id uuid REFERENCES analytics_metrics(analytics_metric_id),
  widget_type text NOT NULL CHECK (widget_type IN ('KPI','LINE','BAR','TABLE','GAUGE','HEATMAP','FUNNEL')),
  title text NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics_alerts (
  analytics_alert_id uuid PRIMARY KEY,
  institution_key text NOT NULL,
  analytics_metric_id uuid NOT NULL REFERENCES analytics_metrics(analytics_metric_id),
  severity text NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  title text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  observed_value numeric,
  threshold_value numeric,
  assigned_to text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics_snapshots (
  analytics_snapshot_id uuid PRIMARY KEY,
  institution_key text NOT NULL,
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('DAILY','MONTH_END','QUARTER_END','YEAR_END','AD_HOC')),
  snapshot_date date NOT NULL,
  status text NOT NULL DEFAULT 'BUILDING' CHECK (status IN ('BUILDING','COMPLETE','FAILED','LOCKED')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_key,snapshot_type,snapshot_date)
);

CREATE TABLE analytics_events (
  analytics_event_id uuid PRIMARY KEY,
  institution_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_metrics_institution_category ON analytics_metrics(institution_key,category,status);
CREATE INDEX idx_analytics_values_metric_period ON analytics_metric_values(institution_key,analytics_metric_id,period_end DESC);
CREATE INDEX idx_analytics_alerts_open ON analytics_alerts(institution_key,status,severity,created_at DESC);
CREATE INDEX idx_analytics_events_entity ON analytics_events(institution_key,entity_type,entity_id,created_at DESC);

COMMIT;
