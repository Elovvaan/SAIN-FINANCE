"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

type Summary = {
  active_definitions: number;
  active_schedules: number;
  pending_runs: number;
  failed_runs: number;
  completed_last_30_days: number;
};

type Definition = {
  reporting_definition_id: string;
  report_code: string;
  report_name: string;
  report_type: string;
  audience: string;
  status: string;
  description: string | null;
};

type Schedule = {
  reporting_schedule_id: string;
  reporting_definition_id: string;
  schedule_name: string;
  frequency: string;
  timezone: string;
  next_run_at: string | null;
  status: string;
  report_code: string;
  report_name: string;
  report_type: string;
};

type Run = {
  reporting_run_id: string;
  report_code: string;
  report_name: string;
  report_type: string;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  status: string;
  output_format: string;
  output_location: string | null;
  error_message: string | null;
  created_at: string;
};

type Workspace = {
  definitions: Definition[];
  schedules: Schedule[];
  runs: Run[];
  summary: Summary;
};

const emptyWorkspace: Workspace = {
  definitions: [],
  schedules: [],
  runs: [],
  summary: { active_definitions: 0, active_schedules: 0, pending_runs: 0, failed_runs: 0, completed_last_30_days: 0 },
};

export default function EnterpriseReportingPage() {
  const [workspace,setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [query,setQuery] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [definitionForm,setDefinitionForm] = useState({ reportCode: "", reportName: "", reportType: "EXECUTIVE", audience: "EXECUTIVE", description: "" });
  const [runForm,setRunForm] = useState({ reportingDefinitionId: "", reportingPeriodStart: "", reportingPeriodEnd: "", outputFormat: "PDF" });
  const [scheduleForm,setScheduleForm] = useState({ reportingDefinitionId: "", scheduleName: "", frequency: "MONTHLY", timezone: "America/Denver", nextRunAt: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/operator/reporting?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json() as Workspace & { error?: string };
      if (!response.ok) throw new Error(data.error || "REPORTING_UNAVAILABLE");
      setWorkspace(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REPORTING_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  },[query]);

  useEffect(() => { void load(); },[load]);

  useEffect(() => {
    if (!runForm.reportingDefinitionId && workspace.definitions[0]) {
      setRunForm((current) => ({ ...current, reportingDefinitionId: workspace.definitions[0].reporting_definition_id }));
    }
    if (!scheduleForm.reportingDefinitionId && workspace.definitions[0]) {
      setScheduleForm((current) => ({ ...current, reportingDefinitionId: workspace.definitions[0].reporting_definition_id }));
    }
  },[workspace.definitions,runForm.reportingDefinitionId,scheduleForm.reportingDefinitionId]);

  const summaryCards = useMemo<Array<[string,number]>>(() => [
    ["Active definitions",Number(workspace.summary.active_definitions || 0)],
    ["Active schedules",Number(workspace.summary.active_schedules || 0)],
    ["Pending runs",Number(workspace.summary.pending_runs || 0)],
    ["Failed runs",Number(workspace.summary.failed_runs || 0)],
    ["Completed in 30 days",Number(workspace.summary.completed_last_30_days || 0)],
  ],[workspace.summary]);

  async function post(body: Record<string,unknown>) {
    setError("");
    const response = await fetch("/api/operator/reporting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error || "REPORTING_UNAVAILABLE"); return false; }
    await load();
    return true;
  }

  async function createDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await post({ entityType: "DEFINITION", ...definitionForm });
    if (created) setDefinitionForm({ reportCode: "", reportName: "", reportType: "EXECUTIVE", audience: "EXECUTIVE", description: "" });
  }

  async function createRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await post({ entityType: "RUN", ...runForm });
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await post({ entityType: "SCHEDULE", ...scheduleForm });
    if (created) setScheduleForm((current) => ({ ...current, scheduleName: "", nextRunAt: "" }));
  }

  async function act(itemType: string,itemId: string,action: string) {
    setError("");
    const response = await fetch("/api/operator/reporting", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemType,itemId,action }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error || "REPORTING_UNAVAILABLE"); return; }
    await load();
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7 }}>Phase 17</p>
        <h1 style={{ marginBottom: 8 }}>Enterprise Reporting</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>Regulatory, board, executive, financial, risk, compliance, treasury, and portfolio reporting.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        {summaryCards.map(([label,value]) => <Metric key={label} label={label} value={value} />)}
      </section>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports" style={{ minWidth: 260, padding: 10 }} />
        <button onClick={() => void load()} disabled={loading}>Refresh</button>
      </section>

      {error ? <p role="alert" style={{ padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>{error}</p> : null}

      <section style={panelStyle}>
        <h2>Create report definition</h2>
        <form onSubmit={createDefinition} style={formStyle}>
          <input required value={definitionForm.reportCode} onChange={(event) => setDefinitionForm({ ...definitionForm, reportCode: event.target.value })} placeholder="Report code" />
          <input required value={definitionForm.reportName} onChange={(event) => setDefinitionForm({ ...definitionForm, reportName: event.target.value })} placeholder="Report name" />
          <select value={definitionForm.reportType} onChange={(event) => setDefinitionForm({ ...definitionForm, reportType: event.target.value })}>
            {['REGULATORY','BOARD','EXECUTIVE','FINANCIAL','RISK','COMPLIANCE','TREASURY','PORTFOLIO'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <select value={definitionForm.audience} onChange={(event) => setDefinitionForm({ ...definitionForm, audience: event.target.value })}>
            {['REGULATOR','BOARD','EXECUTIVE','FINANCE','RISK','COMPLIANCE','TREASURY','OPERATIONS'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <input value={definitionForm.description} onChange={(event) => setDefinitionForm({ ...definitionForm, description: event.target.value })} placeholder="Description" />
          <button type="submit">Create definition</button>
        </form>
      </section>

      <section style={panelStyle}>
        <h2>Generate report</h2>
        <form onSubmit={createRun} style={formStyle}>
          <select required value={runForm.reportingDefinitionId} onChange={(event) => setRunForm({ ...runForm, reportingDefinitionId: event.target.value })}>
            <option value="">Select report</option>
            {workspace.definitions.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.reporting_definition_id} value={item.reporting_definition_id}>{item.report_name}</option>)}
          </select>
          <input type="date" value={runForm.reportingPeriodStart} onChange={(event) => setRunForm({ ...runForm, reportingPeriodStart: event.target.value })} />
          <input type="date" value={runForm.reportingPeriodEnd} onChange={(event) => setRunForm({ ...runForm, reportingPeriodEnd: event.target.value })} />
          <select value={runForm.outputFormat} onChange={(event) => setRunForm({ ...runForm, outputFormat: event.target.value })}>
            {['PDF','CSV','XLSX','JSON'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <button type="submit">Queue report</button>
        </form>
      </section>

      <section style={panelStyle}>
        <h2>Schedule report</h2>
        <form onSubmit={createSchedule} style={formStyle}>
          <select required value={scheduleForm.reportingDefinitionId} onChange={(event) => setScheduleForm({ ...scheduleForm, reportingDefinitionId: event.target.value })}>
            <option value="">Select report</option>
            {workspace.definitions.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.reporting_definition_id} value={item.reporting_definition_id}>{item.report_name}</option>)}
          </select>
          <input required value={scheduleForm.scheduleName} onChange={(event) => setScheduleForm({ ...scheduleForm, scheduleName: event.target.value })} placeholder="Schedule name" />
          <select value={scheduleForm.frequency} onChange={(event) => setScheduleForm({ ...scheduleForm, frequency: event.target.value })}>
            {['DAILY','WEEKLY','MONTHLY','QUARTERLY','ANNUALLY','AD_HOC'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <input value={scheduleForm.timezone} onChange={(event) => setScheduleForm({ ...scheduleForm, timezone: event.target.value })} placeholder="Timezone" />
          <input type="datetime-local" value={scheduleForm.nextRunAt} onChange={(event) => setScheduleForm({ ...scheduleForm, nextRunAt: event.target.value })} />
          <button type="submit">Create schedule</button>
        </form>
      </section>

      <section style={panelStyle}>
        <h2>Report definitions</h2>
        <Table columns={["Code","Name","Type","Audience","Status","Actions"]} rows={workspace.definitions.map((item) => [
          item.report_code,
          item.report_name,
          item.report_type,
          item.audience,
          item.status,
          <div key={item.reporting_definition_id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {item.status === "ACTIVE" ? <button onClick={() => void act("DEFINITION",item.reporting_definition_id,"DEACTIVATE")}>Deactivate</button> : <button onClick={() => void act("DEFINITION",item.reporting_definition_id,"ACTIVATE")}>Activate</button>}
            {item.status !== "ARCHIVED" ? <button onClick={() => void act("DEFINITION",item.reporting_definition_id,"ARCHIVE")}>Archive</button> : null}
          </div>,
        ])} />
      </section>

      <section style={panelStyle}>
        <h2>Schedules</h2>
        <Table columns={["Report","Schedule","Frequency","Next run","Status","Actions"]} rows={workspace.schedules.map((item) => [
          item.report_name,
          item.schedule_name,
          item.frequency,
          item.next_run_at ? new Date(item.next_run_at).toLocaleString() : "—",
          item.status,
          <div key={item.reporting_schedule_id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {item.status === "ACTIVE" ? <button onClick={() => void act("SCHEDULE",item.reporting_schedule_id,"PAUSE")}>Pause</button> : <button onClick={() => void act("SCHEDULE",item.reporting_schedule_id,"ACTIVATE")}>Activate</button>}
            {item.status !== "DISABLED" ? <button onClick={() => void act("SCHEDULE",item.reporting_schedule_id,"DISABLE")}>Disable</button> : null}
          </div>,
        ])} />
      </section>

      <section style={panelStyle}>
        <h2>Report runs</h2>
        <Table columns={["Report","Period","Format","Status","Created","Actions"]} rows={workspace.runs.map((item) => [
          item.report_name,
          item.reporting_period_start || item.reporting_period_end ? `${item.reporting_period_start || "—"} to ${item.reporting_period_end || "—"}` : "Ad hoc",
          item.output_format,
          item.status,
          new Date(item.created_at).toLocaleString(),
          <div key={item.reporting_run_id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {item.status === "QUEUED" ? <button onClick={() => void act("RUN",item.reporting_run_id,"START")}>Start</button> : null}
            {item.status === "RUNNING" ? <button onClick={() => void act("RUN",item.reporting_run_id,"COMPLETE")}>Complete</button> : null}
            {!['COMPLETE','FAILED','CANCELLED'].includes(item.status) ? <button onClick={() => void act("RUN",item.reporting_run_id,"CANCEL")}>Cancel</button> : null}
          </div>,
        ])} />
      </section>

      {loading ? <p>Loading reporting workspace…</p> : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article style={panelStyle}><small>{label}</small><h2 style={{ marginBottom: 0 }}>{value}</h2></article>;
}

function Table({ columns, rows }: { columns: string[]; rows: Array<Array<string | ReactNode>> }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{columns.map((column) => <th key={column} style={cellStyle}>{column}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} style={cellStyle}>No records</td></tr> : rows.map((row,rowIndex) => <tr key={rowIndex}>{row.map((cell,cellIndex) => <td key={cellIndex} style={cellStyle}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const panelStyle = { border: "1px solid rgba(127,127,127,0.25)", borderRadius: 12, padding: 16 };
const formStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 };
const cellStyle = { textAlign: "left" as const, borderBottom: "1px solid rgba(127,127,127,0.2)", padding: "10px 8px", verticalAlign: "top" as const };
