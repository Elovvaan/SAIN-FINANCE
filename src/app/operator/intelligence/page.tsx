"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Row = Record<string, unknown>;
type Summary = {
  active_models?: number;
  active_tasks?: number;
  review_required?: number;
  open_recommendations?: number;
  failed_sources?: number;
};
type Workspace = {
  models: Row[];
  prompts: Row[];
  sources: Row[];
  conversations: Row[];
  tasks: Row[];
  recommendations: Row[];
  summary: Summary;
};

const emptyWorkspace: Workspace = { models: [], prompts: [], sources: [], conversations: [], tasks: [], recommendations: [], summary: {} };
const assistantOptions = ["UNDERWRITING","COMPLIANCE","CREDIT","DOCUMENT","FRAUD","EXECUTIVE","OPERATIONS"];

export default function IntelligencePage() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/operator/intelligence", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "INTELLIGENCE_UNAVAILABLE");
    setWorkspace(payload);
  }, []);

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>, entityType: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { entityType };
    data.forEach((value, key) => { body[key] = value; });
    if (typeof body.capabilities === "string") body.capabilities = body.capabilities.split(",").map((value) => value.trim()).filter(Boolean);
    const response = await fetch("/api/operator/intelligence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    setMessage(response.ok ? `${entityType} created` : payload.error || "Request failed");
    if (response.ok) { event.currentTarget.reset(); await load(); }
  }

  async function action(itemType: string, itemId: unknown, itemAction: string) {
    const response = await fetch("/api/operator/intelligence", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemType, itemId, action: itemAction }) });
    const payload = await response.json();
    setMessage(response.ok ? `${itemType} ${payload.status}` : payload.error || "Request failed");
    if (response.ok) await load();
  }

  const summaryCards: Array<[string, number]> = [
    ["Active models", workspace.summary.active_models ?? 0],
    ["Active tasks", workspace.summary.active_tasks ?? 0],
    ["Review required", workspace.summary.review_required ?? 0],
    ["Open recommendations", workspace.summary.open_recommendations ?? 0],
    ["Failed sources", workspace.summary.failed_sources ?? 0],
  ];

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <header>
        <h1>Intelligence Platform</h1>
        <p>Institution copilots, model governance, knowledge sources, AI tasks, recommendations, and human review.</p>
        {message && <p><strong>{message}</strong></p>}
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        {summaryCards.map(([label, value]) => <article key={label} style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}><small>{label}</small><h2>{value}</h2></article>)}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20 }}>
        <form onSubmit={(event) => submit(event, "MODEL")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Add model configuration</h2>
          <input name="configCode" placeholder="Configuration code" required />
          <input name="configName" placeholder="Configuration name" required />
          <input name="provider" placeholder="Provider" required />
          <input name="modelName" placeholder="Model name" required />
          <input name="capabilities" placeholder="CHAT,ANALYSIS,EXTRACTION" />
          <input name="credentialReference" placeholder="Secret reference, not secret value" />
          <button type="submit">Create model</button>
        </form>

        <form onSubmit={(event) => submit(event, "PROMPT")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Add prompt template</h2>
          <input name="templateCode" placeholder="Template code" required />
          <input name="templateName" placeholder="Template name" required />
          <select name="assistantType" defaultValue="OPERATIONS">{assistantOptions.map((value) => <option key={value}>{value}</option>)}</select>
          <textarea name="systemInstructions" placeholder="System instructions" rows={5} required />
          <button type="submit">Create prompt</button>
        </form>

        <form onSubmit={(event) => submit(event, "SOURCE")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Add knowledge source</h2>
          <input name="sourceCode" placeholder="Source code" required />
          <input name="sourceName" placeholder="Source name" required />
          <select name="sourceType" defaultValue="PROCEDURE"><option>DOCUMENT_REPOSITORY</option><option>POLICY_LIBRARY</option><option>DATABASE_VIEW</option><option>EXTERNAL_REFERENCE</option><option>PROCEDURE</option></select>
          <input name="sourceReference" placeholder="Repository, path, view, or reference" required />
          <button type="submit">Create source</button>
        </form>

        <form onSubmit={(event) => submit(event, "CONVERSATION")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Start copilot conversation</h2>
          <select name="assistantType" defaultValue="OPERATIONS">{assistantOptions.map((value) => <option key={value}>{value}</option>)}</select>
          <input name="title" placeholder="Conversation title" required />
          <input name="contextEntityType" placeholder="Context entity type" />
          <input name="contextEntityId" placeholder="Context entity ID" />
          <textarea name="message" placeholder="Opening message" rows={4} />
          <button type="submit">Start conversation</button>
        </form>

        <form onSubmit={(event) => submit(event, "TASK")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Queue intelligence task</h2>
          <input name="taskType" placeholder="Task type" required />
          <select name="assistantType" defaultValue="OPERATIONS">{assistantOptions.map((value) => <option key={value}>{value}</option>)}</select>
          <select name="priority" defaultValue="NORMAL"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>CRITICAL</option></select>
          <input name="sourceEntityType" placeholder="Source entity type" />
          <input name="sourceEntityId" placeholder="Source entity ID" />
          <button type="submit">Queue task</button>
        </form>

        <form onSubmit={(event) => submit(event, "RECOMMENDATION")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Record recommendation</h2>
          <input name="recommendationType" placeholder="Recommendation type" required />
          <input name="title" placeholder="Title" required />
          <textarea name="recommendation" placeholder="Recommendation and explanation" rows={4} required />
          <select name="severity" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select>
          <input type="number" min="0" max="1" step="0.01" name="confidenceScore" placeholder="Confidence 0–1" />
          <button type="submit">Record recommendation</button>
        </form>
      </section>

      <section><h2>Model configurations</h2><div style={{ overflowX: "auto" }}><table><thead><tr><th>Code</th><th>Name</th><th>Provider</th><th>Model</th><th>Status</th><th>Actions</th></tr></thead><tbody>{workspace.models.map((item) => <tr key={String(item.model_config_id)}><td>{String(item.config_code)}</td><td>{String(item.config_name)}</td><td>{String(item.provider)}</td><td>{String(item.model_name)}</td><td>{String(item.status)}</td><td><button onClick={() => action("MODEL",item.model_config_id,item.status === "ACTIVE" ? "DEACTIVATE" : "ACTIVATE")}>{item.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div></section>

      <section><h2>Knowledge sources</h2><div style={{ overflowX: "auto" }}><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Status</th><th>Last indexed</th><th>Actions</th></tr></thead><tbody>{workspace.sources.map((item) => <tr key={String(item.knowledge_source_id)}><td>{String(item.source_code)}</td><td>{String(item.source_name)}</td><td>{String(item.source_type)}</td><td>{String(item.status)}</td><td>{String(item.last_indexed_at || "Never")}</td><td><button onClick={() => action("SOURCE",item.knowledge_source_id,"INDEX")}>Index</button> <button onClick={() => action("SOURCE",item.knowledge_source_id,item.status === "ACTIVE" ? "DEACTIVATE" : "ACTIVATE")}>{item.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div></section>

      <section><h2>Intelligence tasks</h2><div style={{ overflowX: "auto" }}><table><thead><tr><th>Type</th><th>Assistant</th><th>Priority</th><th>Status</th><th>Entity</th><th>Confidence</th><th>Actions</th></tr></thead><tbody>{workspace.tasks.map((item) => <tr key={String(item.intelligence_task_id)}><td>{String(item.task_type)}</td><td>{String(item.assistant_type)}</td><td>{String(item.priority)}</td><td>{String(item.status)}</td><td>{String(item.source_entity_type || "")} {String(item.source_entity_id || "")}</td><td>{String(item.confidence_score ?? "")}</td><td>{item.status === "QUEUED" && <button onClick={() => action("TASK",item.intelligence_task_id,"START")}>Start</button>} {item.status === "PROCESSING" && <button onClick={() => action("TASK",item.intelligence_task_id,"REVIEW")}>Send to review</button>} {item.status === "REVIEW_REQUIRED" && <><button onClick={() => action("TASK",item.intelligence_task_id,"APPROVE")}>Approve</button> <button onClick={() => action("TASK",item.intelligence_task_id,"REJECT")}>Reject</button></>}</td></tr>)}</tbody></table></div></section>

      <section><h2>Recommendations</h2><div style={{ overflowX: "auto" }}><table><thead><tr><th>Severity</th><th>Title</th><th>Recommendation</th><th>Status</th><th>Confidence</th><th>Actions</th></tr></thead><tbody>{workspace.recommendations.map((item) => <tr key={String(item.recommendation_id)}><td>{String(item.severity)}</td><td>{String(item.title)}</td><td>{String(item.recommendation)}</td><td>{String(item.status)}</td><td>{String(item.confidence_score ?? "")}</td><td>{item.status === "OPEN" && <><button onClick={() => action("RECOMMENDATION",item.recommendation_id,"ACCEPT")}>Accept</button> <button onClick={() => action("RECOMMENDATION",item.recommendation_id,"DISMISS")}>Dismiss</button></>} {item.status === "ACCEPTED" && <button onClick={() => action("RECOMMENDATION",item.recommendation_id,"IMPLEMENT")}>Implemented</button>}</td></tr>)}</tbody></table></div></section>

      <section><h2>Copilot conversations</h2><div style={{ overflowX: "auto" }}><table><thead><tr><th>Assistant</th><th>Title</th><th>Status</th><th>Context</th><th>Updated</th></tr></thead><tbody>{workspace.conversations.map((item) => <tr key={String(item.conversation_id)}><td>{String(item.assistant_type)}</td><td>{String(item.title)}</td><td>{String(item.status)}</td><td>{String(item.context_entity_type || "")} {String(item.context_entity_id || "")}</td><td>{String(item.updated_at)}</td></tr>)}</tbody></table></div></section>
    </main>
  );
}
