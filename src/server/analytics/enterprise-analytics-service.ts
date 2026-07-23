import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type AnalyticsOperator = { institutionKey: string; userId: string };

const audiences = new Set(["EXECUTIVE","BOARD","RISK","TREASURY","LENDING","SERVICING","COMPLIANCE","OPERATIONS"]);
const categories = new Set(["PORTFOLIO","LIQUIDITY","PROFITABILITY","DELINQUENCY","CHARGE_OFF","RISK","COMPLIANCE","PRODUCTIVITY","CUSTOMER","CAPITAL"]);
const aggregations = new Set(["SUM","AVERAGE","COUNT","MIN","MAX","RATIO","LATEST"]);
const snapshotTypes = new Set(["DAILY","MONTH_END","QUARTER_END","YEAR_END","AD_HOC"]);

export async function listAnalyticsWorkspace(operator: AnalyticsOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [dashboards, metrics, alerts, snapshots, summary] = await Promise.all([
      client.query(
        `SELECT analytics_dashboard_id,dashboard_code,dashboard_name,audience,status,description,updated_at
         FROM analytics_dashboards
         WHERE institution_key=$1
           AND ($2='' OR to_tsvector('english',dashboard_code||' '||dashboard_name||' '||audience) @@ plainto_tsquery('english',$2))
         ORDER BY audience,dashboard_name`,
        [operator.institutionKey,query.trim()],
      ),
      client.query(
        `SELECT m.analytics_metric_id,m.metric_code,m.metric_name,m.category,m.unit,m.aggregation,m.target_value,m.warning_threshold,m.critical_threshold,m.status,
                v.metric_value,v.comparison_value,v.period_end,v.status AS value_status
         FROM analytics_metrics m
         LEFT JOIN LATERAL (
           SELECT metric_value,comparison_value,period_end,status
           FROM analytics_metric_values v
           WHERE v.institution_key=m.institution_key AND v.analytics_metric_id=m.analytics_metric_id
           ORDER BY period_end DESC,calculated_at DESC LIMIT 1
         ) v ON true
         WHERE m.institution_key=$1
         ORDER BY m.category,m.metric_name`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT a.analytics_alert_id,a.severity,a.title,a.message,a.status,a.observed_value,a.threshold_value,a.assigned_to,a.created_at,
                m.metric_code,m.metric_name,m.category
         FROM analytics_alerts a
         JOIN analytics_metrics m ON m.institution_key=a.institution_key AND m.analytics_metric_id=a.analytics_metric_id
         WHERE a.institution_key=$1
         ORDER BY CASE a.status WHEN 'OPEN' THEN 1 WHEN 'ACKNOWLEDGED' THEN 2 ELSE 3 END,
                  CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,a.created_at DESC
         LIMIT 250`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT analytics_snapshot_id,snapshot_type,snapshot_date,status,summary,completed_at,created_at
         FROM analytics_snapshots WHERE institution_key=$1
         ORDER BY snapshot_date DESC,created_at DESC LIMIT 100`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM analytics_dashboards WHERE institution_key=$1 AND status='ACTIVE') AS active_dashboards,
           (SELECT COUNT(*)::int FROM analytics_metrics WHERE institution_key=$1 AND status='ACTIVE') AS active_metrics,
           (SELECT COUNT(*)::int FROM analytics_alerts WHERE institution_key=$1 AND status='OPEN' AND severity='CRITICAL') AS critical_alerts,
           (SELECT COUNT(*)::int FROM analytics_alerts WHERE institution_key=$1 AND status IN ('OPEN','ACKNOWLEDGED')) AS open_alerts,
           (SELECT COUNT(*)::int FROM analytics_snapshots WHERE institution_key=$1 AND status='FAILED') AS failed_snapshots`,
        [operator.institutionKey],
      ),
    ]);
    return { dashboards: dashboards.rows, metrics: metrics.rows, alerts: alerts.rows, snapshots: snapshots.rows, summary: summary.rows[0] };
  });
}

export async function createAnalyticsDashboard(input: { operator: AnalyticsOperator; dashboardCode: string; dashboardName: string; audience: string; description?: string; layout?: Record<string,unknown> }) {
  if (!input.dashboardCode.trim() || !input.dashboardName.trim()) throw new Error("ANALYTICS_DASHBOARD_FIELDS_REQUIRED");
  if (!audiences.has(input.audience)) throw new Error("ANALYTICS_AUDIENCE_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const analyticsDashboardId = randomUUID();
    await client.query(
      `INSERT INTO analytics_dashboards
       (analytics_dashboard_id,institution_key,dashboard_code,dashboard_name,audience,description,layout,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8)`,
      [analyticsDashboardId,input.operator.institutionKey,input.dashboardCode.trim().toUpperCase(),input.dashboardName.trim(),input.audience,input.description?.trim() || null,JSON.stringify(input.layout || {}),input.operator.userId],
    );
    await recordEvent(client,input.operator,"DASHBOARD",analyticsDashboardId,"DASHBOARD_CREATED",{ audience: input.audience });
    return { analyticsDashboardId,status: "ACTIVE" };
  });
}

export async function createAnalyticsMetric(input: { operator: AnalyticsOperator; metricCode: string; metricName: string; category: string; unit?: string; aggregation?: string; targetValue?: number; warningThreshold?: number; criticalThreshold?: number; sourceDefinition?: Record<string,unknown> }) {
  if (!input.metricCode.trim() || !input.metricName.trim()) throw new Error("ANALYTICS_METRIC_FIELDS_REQUIRED");
  if (!categories.has(input.category)) throw new Error("ANALYTICS_CATEGORY_INVALID");
  const aggregation = input.aggregation || "SUM";
  if (!aggregations.has(aggregation)) throw new Error("ANALYTICS_AGGREGATION_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const analyticsMetricId = randomUUID();
    await client.query(
      `INSERT INTO analytics_metrics
       (analytics_metric_id,institution_key,metric_code,metric_name,category,unit,aggregation,source_definition,target_value,warning_threshold,critical_threshold,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$12)`,
      [analyticsMetricId,input.operator.institutionKey,input.metricCode.trim().toUpperCase(),input.metricName.trim(),input.category,input.unit?.trim().toUpperCase() || "NUMBER",aggregation,JSON.stringify(input.sourceDefinition || {}),input.targetValue ?? null,input.warningThreshold ?? null,input.criticalThreshold ?? null,input.operator.userId],
    );
    await recordEvent(client,input.operator,"METRIC",analyticsMetricId,"METRIC_CREATED",{ category: input.category });
    return { analyticsMetricId,status: "ACTIVE" };
  });
}

export async function recordMetricValue(input: { operator: AnalyticsOperator; analyticsMetricId: string; periodStart: string; periodEnd: string; metricValue: number; comparisonValue?: number; dimensionValues?: Record<string,unknown>; status?: string }) {
  if (!input.analyticsMetricId || !input.periodStart || !input.periodEnd || !Number.isFinite(input.metricValue)) throw new Error("ANALYTICS_VALUE_FIELDS_REQUIRED");
  const status = input.status || "FINAL";
  if (!new Set(["PRELIMINARY","FINAL","RESTATED"]).has(status)) throw new Error("ANALYTICS_VALUE_STATUS_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const metric = await client.query(`SELECT analytics_metric_id,warning_threshold,critical_threshold FROM analytics_metrics WHERE institution_key=$1 AND analytics_metric_id=$2`,[input.operator.institutionKey,input.analyticsMetricId]);
    if (!metric.rows[0]) throw new Error("ANALYTICS_METRIC_NOT_FOUND");
    const analyticsMetricValueId = randomUUID();
    await client.query(
      `INSERT INTO analytics_metric_values
       (analytics_metric_value_id,institution_key,analytics_metric_id,period_start,period_end,dimension_values,metric_value,comparison_value,status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
      [analyticsMetricValueId,input.operator.institutionKey,input.analyticsMetricId,input.periodStart,input.periodEnd,JSON.stringify(input.dimensionValues || {}),input.metricValue,input.comparisonValue ?? null,status,input.operator.userId],
    );
    await recordEvent(client,input.operator,"METRIC_VALUE",analyticsMetricValueId,"METRIC_VALUE_RECORDED",{ analyticsMetricId: input.analyticsMetricId, metricValue: input.metricValue });
    return { analyticsMetricValueId,status };
  });
}

export async function createAnalyticsAlert(input: { operator: AnalyticsOperator; analyticsMetricId: string; severity: string; title: string; message: string; observedValue?: number; thresholdValue?: number; assignedTo?: string }) {
  if (!input.analyticsMetricId || !input.title.trim() || !input.message.trim()) throw new Error("ANALYTICS_ALERT_FIELDS_REQUIRED");
  if (!new Set(["INFO","WARNING","CRITICAL"]).has(input.severity)) throw new Error("ANALYTICS_ALERT_SEVERITY_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const analyticsAlertId = randomUUID();
    await client.query(
      `INSERT INTO analytics_alerts
       (analytics_alert_id,institution_key,analytics_metric_id,severity,title,message,observed_value,threshold_value,assigned_to)
       SELECT $1,$2,analytics_metric_id,$3,$4,$5,$6,$7,$8 FROM analytics_metrics
       WHERE institution_key=$2 AND analytics_metric_id=$9`,
      [analyticsAlertId,input.operator.institutionKey,input.severity,input.title.trim(),input.message.trim(),input.observedValue ?? null,input.thresholdValue ?? null,input.assignedTo?.trim() || null,input.analyticsMetricId],
    );
    await recordEvent(client,input.operator,"ALERT",analyticsAlertId,"ALERT_CREATED",{ severity: input.severity });
    return { analyticsAlertId,status: "OPEN" };
  });
}

export async function createAnalyticsSnapshot(input: { operator: AnalyticsOperator; snapshotType: string; snapshotDate: string; summary?: Record<string,unknown> }) {
  if (!snapshotTypes.has(input.snapshotType) || !input.snapshotDate) throw new Error("ANALYTICS_SNAPSHOT_FIELDS_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const analyticsSnapshotId = randomUUID();
    await client.query(
      `INSERT INTO analytics_snapshots
       (analytics_snapshot_id,institution_key,snapshot_type,snapshot_date,summary,created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [analyticsSnapshotId,input.operator.institutionKey,input.snapshotType,input.snapshotDate,JSON.stringify(input.summary || {}),input.operator.userId],
    );
    await recordEvent(client,input.operator,"SNAPSHOT",analyticsSnapshotId,"SNAPSHOT_CREATED",{ snapshotType: input.snapshotType });
    return { analyticsSnapshotId,status: "BUILDING" };
  });
}

export async function updateAnalyticsItem(input: { operator: AnalyticsOperator; itemType: string; itemId: string; action: string }) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    if (input.itemType === "DASHBOARD" || input.itemType === "METRIC") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", ARCHIVE: "ARCHIVED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("ANALYTICS_ACTION_INVALID");
      const table = input.itemType === "DASHBOARD" ? "analytics_dashboards" : "analytics_metrics";
      const idColumn = input.itemType === "DASHBOARD" ? "analytics_dashboard_id" : "analytics_metric_id";
      const result = await client.query(`UPDATE ${table} SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND ${idColumn}=$2 RETURNING ${idColumn}`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error(`ANALYTICS_${input.itemType}_NOT_FOUND`);
      await recordEvent(client,input.operator,input.itemType,input.itemId,`${input.itemType}_${status}`,{});
      return { status };
    }
    if (input.itemType === "ALERT") {
      const statusByAction: Record<string,string> = { ACKNOWLEDGE: "ACKNOWLEDGED", RESOLVE: "RESOLVED", DISMISS: "DISMISSED", REOPEN: "OPEN" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("ANALYTICS_ACTION_INVALID");
      const result = await client.query(`UPDATE analytics_alerts SET status=$3,acknowledged_at=CASE WHEN $3='ACKNOWLEDGED' THEN NOW() ELSE acknowledged_at END,resolved_at=CASE WHEN $3='RESOLVED' THEN NOW() ELSE resolved_at END,updated_at=NOW() WHERE institution_key=$1 AND analytics_alert_id=$2 RETURNING analytics_alert_id`,[input.operator.institutionKey,input.itemId,status]);
      if (!result.rows[0]) throw new Error("ANALYTICS_ALERT_NOT_FOUND");
      await recordEvent(client,input.operator,"ALERT",input.itemId,`ALERT_${status}`,{});
      return { status };
    }
    if (input.itemType === "SNAPSHOT") {
      const statusByAction: Record<string,string> = { COMPLETE: "COMPLETE", FAIL: "FAILED", LOCK: "LOCKED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("ANALYTICS_ACTION_INVALID");
      const result = await client.query(`UPDATE analytics_snapshots SET status=$3,completed_at=CASE WHEN $3 IN ('COMPLETE','LOCKED') THEN NOW() ELSE completed_at END WHERE institution_key=$1 AND analytics_snapshot_id=$2 RETURNING analytics_snapshot_id`,[input.operator.institutionKey,input.itemId,status]);
      if (!result.rows[0]) throw new Error("ANALYTICS_SNAPSHOT_NOT_FOUND");
      await recordEvent(client,input.operator,"SNAPSHOT",input.itemId,`SNAPSHOT_${status}`,{});
      return { status };
    }
    throw new Error("ANALYTICS_ITEM_TYPE_INVALID");
  });
}

async function recordEvent(client: { query: (text: string, values?: unknown[]) => Promise<unknown> }, operator: AnalyticsOperator, entityType: string, entityId: string, eventType: string, eventData: Record<string,unknown>) {
  await client.query(`INSERT INTO analytics_events (analytics_event_id,institution_key,entity_type,entity_id,event_type,event_data,actor_user_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,[randomUUID(),operator.institutionKey,entityType,entityId,eventType,JSON.stringify(eventData),operator.userId]);
}
