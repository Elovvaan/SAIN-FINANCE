"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Summary = {
  active_dashboards: number;
  active_metrics: number;
  critical_alerts: number;
  open_alerts: number;
  failed_snapshots: number;
};

type Dashboard = {
  analytics_dashboard_id: string;
  dashboard_code: string;
  dashboard_name: string;
  audience: string;
  status: string;
  description: string | null;
};

type Metric = {
  analytics_metric_id: string;
  metric_code: string;
  metric_name: string;
  category: string;
  unit: string;
  aggregation: string;
  target_value: string | number | null;
  warning_threshold: string | number | null;
  critical_threshold: string | number | null;
  status: string;
  metric_value: string | number | null;
  comparison_value: string | number | null;
  period_end: string | null;
};

type Alert = {
  analytics_alert_id: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  observed_value: string | number | null;
  threshold_value: string | number | null;
  metric_code: string;
  metric_name: string;
  category: string;
};

type Snapshot = {
  analytics_snapshot_id: string;
  snapshot_type: string;
  snapshot_date: string;
  status: string;
};

type Workspace = {
  dashboards: Dashboard[];
  metrics: Metric[];
  alerts: Alert[];
  snapshots: Snapshot[];
  summary: Summary;
};

const emptyWorkspace: Workspace = {
  dashboards: [],
  metrics: [],
  alerts: [],
  snapshots: [],
  summary: { active_dashboards: 0, active_metrics: 0, critical_alerts: 0, open_alerts: 0, failed_snapshots: 0 },
};

export default function EnterpriseAnalyticsPage() {
  const [workspace,setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [query,setQuery] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [form,setForm] = useState({ entityType: "METRIC", code: "", name: "", category: "PORTFOLIO", audience: "EXECUTIVE", unit: "NUMBER", aggregation: "SUM" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/operator/analytics?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json() as Workspace & { error?: string };
      if (!response.ok) throw new Error(data.error || "ANALYTICS_UNAVAILABLE");
      setWorkspace(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ANALYTICS_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  },[query]);

  useEffect(() => { void load(); },[load]);

  const summaryCards = useMemo<Array<[string,number]>>(() => [
    ["Active dashboards",Number(workspace.summary.active_dashboards || 0)],
    ["Active metrics",Number(workspace.summary.active_metrics || 0)],
    ["Critical alerts",Number(workspace.summary.critical_alerts || 0)],
    ["Open alerts",Number(workspace.summary.open_alerts || 0)],
    ["Failed snapshots",Number(workspace.summary.failed_snapshots || 0)],
  ],[workspace.summary]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const body = form.entityType === "DASHBOARD"
      ? { entityType: "DASHBOARD", dashboardCode: form.code, dashboardName: form.name, audience: form.audience }
      : { entityType: "METRIC", metricCode: form.code, metricName: form.name, category: form.category, unit: form.unit, aggregation: form.aggregation };
    const response = await fetch("/api/operator/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error || "ANALYTICS_UNAVAILABLE"); return; }
    setForm((current) => ({ ...current, code: "", name: "" }));
    await load();
  }

  async function act(itemType: string,itemId: string,action: string) {
    const response = await fetch("/api/operator/analytics", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemType,itemId,action }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error || "ANALYTICS_UNAVAILABLE"); return; }
    await load();
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7 }}>Phase 15</p>
        <h1 style={{ marginBottom: 8 }}>Enterprise Analytics</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>Executive intelligence, portfolio metrics, threshold alerts, and institutional snapshots.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        {summaryCards.map(([label,value]) => (
          <article key={label} style={{ border: "1px solid #d7d7d7", borderRadius: 12, padding: 16 }}>
            <small>{label}</small>
            <h2 style={{ marginBottom: 0 }}>{value}</h2>
          </article>
        ))}
      </section>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dashboards" style={{ minWidth: 260, padding: 10 }} />
        <button onClick={() => void load()} disabled={loading}>Refresh</button>
      </section>

      {error ? <p role="alert" style={{ padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>{error}</p> : null}

      <form onSubmit={submit} style={{ display: "grid", gap: 10, border: "1px solid #d7d7d7", borderRadius: 12, padding: 16 }}>
        <h2 style={{ margin: 0 }}>Register analytics asset</h2>
        <select value={form.entityType} onChange={(event) => setForm({ ...form, entityType: event.target.value })}>
          <option value="METRIC">Metric</option>
          <option value="DASHBOARD">Dashboard</option>
        </select>
        <input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="Code" />
        <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name" />
        {form.entityType === "DASHBOARD" ? (
          <select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })}>
            {['EXECUTIVE','BOARD','RISK','TREASURY','LENDING','SERVICING','COMPLIANCE','OPERATIONS'].map((value) => <option key={value}>{value}</option>)}
          </select>
        ) : (
          <>
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {['PORTFOLIO','LIQUIDITY','PROFITABILITY','DELINQUENCY','CHARGE_OFF','RISK','COMPLIANCE','PRODUCTIVITY','CUSTOMER','CAPITAL'].map((value) => <option key={value}>{value}</option>)}
            </select>
            <input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="Unit" />
            <select value={form.aggregation} onChange={(event) => setForm({ ...form, aggregation: event.target.value })}>
              {['SUM','AVERAGE','COUNT','MIN','MAX','RATIO','LATEST'].map((value) => <option key={value}>{value}</option>)}
            </select>
          </>
        )}
        <button type="submit">Create</button>
      </form>

      <section>
        <h2>Metrics</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {workspace.metrics.map((metric) => (
            <article key={metric.analytics_metric_id} style={{ border: "1px solid #d7d7d7", borderRadius: 12, padding: 14 }}>
              <strong>{metric.metric_name}</strong> <small>{metric.metric_code} · {metric.category}</small>
              <p>Latest: {metric.metric_value == null ? "—" : String(metric.metric_value)} {metric.unit} · {metric.status}</p>
              <button onClick={() => void act("METRIC",metric.analytics_metric_id,metric.status === "ACTIVE" ? "DEACTIVATE" : "ACTIVATE")}>{metric.status === "ACTIVE" ? "Deactivate" : "Activate"}</button>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>Alerts</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {workspace.alerts.map((alert) => (
            <article key={alert.analytics_alert_id} style={{ border: "1px solid #d7d7d7", borderRadius: 12, padding: 14 }}>
              <strong>{alert.severity}: {alert.title}</strong>
              <p>{alert.message}</p>
              <small>{alert.metric_name} · {alert.status}</small>
              {alert.status === "OPEN" ? <button onClick={() => void act("ALERT",alert.analytics_alert_id,"ACKNOWLEDGE")}>Acknowledge</button> : null}
              {alert.status !== "RESOLVED" ? <button onClick={() => void act("ALERT",alert.analytics_alert_id,"RESOLVE")}>Resolve</button> : null}
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>Dashboards</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {workspace.dashboards.map((dashboard) => (
            <article key={dashboard.analytics_dashboard_id} style={{ border: "1px solid #d7d7d7", borderRadius: 12, padding: 14 }}>
              <strong>{dashboard.dashboard_name}</strong>
              <p>{dashboard.dashboard_code} · {dashboard.audience} · {dashboard.status}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>Snapshots</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {workspace.snapshots.map((snapshot) => (
            <article key={snapshot.analytics_snapshot_id} style={{ border: "1px solid #d7d7d7", borderRadius: 12, padding: 14 }}>
              <strong>{snapshot.snapshot_type}</strong>
              <p>{snapshot.snapshot_date} · {snapshot.status}</p>
              {snapshot.status === "BUILDING" ? <button onClick={() => void act("SNAPSHOT",snapshot.analytics_snapshot_id,"COMPLETE")}>Complete</button> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
