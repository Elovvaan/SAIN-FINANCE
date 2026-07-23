"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

type Definition = {
  workflow_definition_id: string;
  workflow_code: string;
  workflow_name: string;
  category: string;
  status: string;
  version: number;
  trigger_type: string;
  updated_at: string;
};

type Instance = {
  workflow_instance_id: string;
  status: string;
  current_step_code: string | null;
  priority: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  workflow_name: string;
  started_at: string;
};

type Task = {
  workflow_task_id: string;
  task_name: string;
  task_type: string;
  step_code: string;
  status: string;
  assigned_user_id: string | null;
  assigned_role: string | null;
  due_at: string | null;
  workflow_name: string;
};

type Approval = {
  workflow_approval_id: string;
  approval_status: string;
  approver_user_id: string | null;
  approver_role: string | null;
  requested_at: string;
  task_name: string;
  workflow_name: string;
};

type Summary = {
  active_definitions: number;
  active_instances: number;
  open_tasks: number;
  overdue_tasks: number;
  pending_approvals: number;
};

type Workspace = {
  definitions: Definition[];
  instances: Instance[];
  tasks: Task[];
  approvals: Approval[];
  summary: Summary;
};

const emptyWorkspace: Workspace = {
  definitions: [],
  instances: [],
  tasks: [],
  approvals: [],
  summary: { active_definitions: 0, active_instances: 0, open_tasks: 0, overdue_tasks: 0, pending_approvals: 0 },
};

const headers = {
  "content-type": "application/json",
  "x-institution-key": "SAIN_FINANCE",
  "x-user-id": "operator-console",
};

export default function WorkflowPage() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ workflowCode: "", workflowName: "", category: "LENDING", triggerType: "MANUAL" });

  const activeDefinitions = useMemo(
    () => workspace.definitions.filter((definition) => definition.status === "ACTIVE"),
    [workspace.definitions],
  );

  async function loadWorkspace(search = query) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/operator/workflow?query=${encodeURIComponent(search)}`, { headers });
      const data = await response.json() as Workspace & { error?: string };
      if (!response.ok) throw new Error(data.error || "WORKFLOW_LOAD_FAILED");
      setWorkspace(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "WORKFLOW_LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace("");
  }, []);

  async function createDefinition(event: FormEvent) {
    event.preventDefault();
    await runAction({ action: "CREATE_DEFINITION", ...form });
    setForm({ workflowCode: "", workflowName: "", category: "LENDING", triggerType: "MANUAL" });
  }

  async function runAction(payload: Record<string, unknown>) {
    setMessage("");
    try {
      const response = await fetch("/api/operator/workflow", { method: "POST", headers, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "WORKFLOW_ACTION_FAILED");
      setMessage("Workflow action completed.");
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "WORKFLOW_ACTION_FAILED");
    }
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7 }}>Phase 16</p>
        <h1 style={{ margin: "4px 0" }}>Enterprise Workflow Engine</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>Definitions, running instances, tasks, approvals, and operational exceptions.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Metric label="Active definitions" value={workspace.summary.active_definitions} />
        <Metric label="Active instances" value={workspace.summary.active_instances} />
        <Metric label="Open tasks" value={workspace.summary.open_tasks} />
        <Metric label="Overdue tasks" value={workspace.summary.overdue_tasks} />
        <Metric label="Pending approvals" value={workspace.summary.pending_approvals} />
      </section>

      <section style={panelStyle}>
        <h2>Create workflow definition</h2>
        <form onSubmit={createDefinition} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <input required placeholder="Workflow code" value={form.workflowCode} onChange={(event) => setForm({ ...form, workflowCode: event.target.value })} />
          <input required placeholder="Workflow name" value={form.workflowName} onChange={(event) => setForm({ ...form, workflowName: event.target.value })} />
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {['LENDING','SERVICING','TREASURY','COMPLIANCE','RISK','CUSTOMER','OPERATIONS','ADMINISTRATION'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <select value={form.triggerType} onChange={(event) => setForm({ ...form, triggerType: event.target.value })}>
            {['MANUAL','EVENT','SCHEDULE','RULE'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <button type="submit">Create definition</button>
        </form>
      </section>

      <section style={panelStyle}>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <h2>Workflow definitions</h2>
          <form onSubmit={(event) => { event.preventDefault(); void loadWorkspace(query); }} style={{ display: "flex", gap: 8 }}>
            <input placeholder="Search workflows" value={query} onChange={(event) => setQuery(event.target.value)} />
            <button type="submit">Search</button>
          </form>
        </div>
        <Table
          columns={["Code","Name","Category","Trigger","Version","Status","Actions"]}
          rows={workspace.definitions.map((definition) => [
            definition.workflow_code,
            definition.workflow_name,
            definition.category,
            definition.trigger_type,
            String(definition.version),
            definition.status,
            <div key={definition.workflow_definition_id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {definition.status !== "ACTIVE" && <button onClick={() => void runAction({ action: "UPDATE_ITEM", itemType: "DEFINITION", itemId: definition.workflow_definition_id, itemAction: "ACTIVATE" })}>Activate</button>}
              {definition.status === "ACTIVE" && <button onClick={() => void runAction({ action: "START_INSTANCE", workflowDefinitionId: definition.workflow_definition_id })}>Start</button>}
              {definition.status !== "RETIRED" && <button onClick={() => void runAction({ action: "UPDATE_ITEM", itemType: "DEFINITION", itemId: definition.workflow_definition_id, itemAction: "RETIRE" })}>Retire</button>}
            </div>,
          ])}
        />
      </section>

      <section style={panelStyle}>
        <h2>Running instances</h2>
        <Table
          columns={["Workflow","Status","Current step","Priority","Related entity","Started","Actions"]}
          rows={workspace.instances.map((instance) => [
            instance.workflow_name,
            instance.status,
            instance.current_step_code || "—",
            instance.priority,
            instance.related_entity_type && instance.related_entity_id ? `${instance.related_entity_type}: ${instance.related_entity_id}` : "—",
            new Date(instance.started_at).toLocaleString(),
            <div key={instance.workflow_instance_id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {instance.status === "RUNNING" && <button onClick={() => void runAction({ action: "UPDATE_ITEM", itemType: "INSTANCE", itemId: instance.workflow_instance_id, itemAction: "PAUSE" })}>Pause</button>}
              {instance.status === "PAUSED" && <button onClick={() => void runAction({ action: "UPDATE_ITEM", itemType: "INSTANCE", itemId: instance.workflow_instance_id, itemAction: "RESUME" })}>Resume</button>}
              {!['COMPLETED','CANCELLED','FAILED'].includes(instance.status) && <button onClick={() => void runAction({ action: "UPDATE_ITEM", itemType: "INSTANCE", itemId: instance.workflow_instance_id, itemAction: "COMPLETE" })}>Complete</button>}
            </div>,
          ])}
        />
      </section>

      <section style={panelStyle}>
        <h2>Open work</h2>
        <Table
          columns={["Workflow","Task","Type","Step","Assignee","Due","Status","Actions"]}
          rows={workspace.tasks.map((task) => [
            task.workflow_name,
            task.task_name,
            task.task_type,
            task.step_code,
            task.assigned_user_id || task.assigned_role || "Unassigned",
            task.due_at ? new Date(task.due_at).toLocaleString() : "—",
            task.status,
            <div key={task.workflow_task_id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {task.status === "OPEN" && <button onClick={() => void runAction({ action: "UPDATE_ITEM", itemType: "TASK", itemId: task.workflow_task_id, itemAction: "START" })}>Start</button>}
              {['OPEN','IN_PROGRESS'].includes(task.status) && <button onClick={() => void runAction({ action: "UPDATE_ITEM", itemType: "TASK", itemId: task.workflow_task_id, itemAction: "COMPLETE" })}>Complete</button>}
            </div>,
          ])}
        />
      </section>

      <section style={panelStyle}>
        <h2>Approvals</h2>
        <Table
          columns={["Workflow","Task","Approver","Requested","Status","Actions"]}
          rows={workspace.approvals.map((approval) => [
            approval.workflow_name,
            approval.task_name,
            approval.approver_user_id || approval.approver_role || "Unassigned",
            new Date(approval.requested_at).toLocaleString(),
            approval.approval_status,
            approval.approval_status === "PENDING" ? (
              <div key={approval.workflow_approval_id} style={{ display: "flex", gap: 6 }}>
                <button onClick={() => void runAction({ action: "UPDATE_ITEM", itemType: "APPROVAL", itemId: approval.workflow_approval_id, itemAction: "APPROVE" })}>Approve</button>
                <button onClick={() => void runAction({ action: "UPDATE_ITEM", itemType: "APPROVAL", itemId: approval.workflow_approval_id, itemAction: "REJECT" })}>Reject</button>
              </div>
            ) : "—",
          ])}
        />
      </section>

      {message && <p>{message}</p>}
      {loading && <p>Loading workflow workspace…</p>}
      {!loading && activeDefinitions.length === 0 && <p>No active workflow definitions yet.</p>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={panelStyle}><div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div><div style={{ opacity: 0.7 }}>{label}</div></div>;
}

function Table({ columns, rows }: { columns: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{columns.map((column) => <th key={column} style={cellStyle}>{column}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} style={cellStyle}>No records</td></tr> : rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} style={cellStyle}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const panelStyle = { border: "1px solid rgba(127,127,127,0.25)", borderRadius: 12, padding: 16 };
const cellStyle = { textAlign: "left" as const, borderBottom: "1px solid rgba(127,127,127,0.2)", padding: "10px 8px", verticalAlign: "top" as const };