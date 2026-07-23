"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Workspace = {
  providers: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  reconciliations: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
};

const emptyWorkspace: Workspace = { providers: [], connections: [], jobs: [], reconciliations: [], summary: {} };

export default function IntegrationsPage() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/operator/integrations?q=${encodeURIComponent(query)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "INTEGRATION_UNAVAILABLE");
    setWorkspace(payload);
  }, [query]);

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>, entityType: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { entityType };
    data.forEach((value, key) => { body[key] = value; });
    if (typeof body.capabilities === "string") body.capabilities = body.capabilities.split(",").map((value) => value.trim()).filter(Boolean);
    const response = await fetch("/api/operator/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    setMessage(response.ok ? `${entityType} created` : payload.error || "Request failed");
    if (response.ok) { event.currentTarget.reset(); await load(); }
  }

  async function action(itemType: string, itemId: unknown, itemAction: string) {
    const response = await fetch("/api/operator/integrations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemType, itemId, action: itemAction }) });
    const payload = await response.json();
    setMessage(response.ok ? `${itemType} ${payload.status}` : payload.error || "Request failed");
    if (response.ok) await load();
  }

  const summary = workspace.summary || {};

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <header>
        <h1>External Integrations</h1>
        <p>Provider connections, integration jobs, health monitoring, retries, webhooks, and reconciliation.</p>
        {message && <p><strong>{message}</strong></p>}
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        {[
          ["Active providers", summary.active_providers],
          ["Degraded connections", summary.degraded_connections],
          ["Job exceptions", summary.job_exceptions],
          ["Failed webhooks", summary.failed_webhooks],
          ["Reconciliation exceptions", summary.reconciliation_exceptions],
        ].map(([label, value]) => <article key={String(label)} style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}><small>{label}</small><h2>{String(value ?? 0)}</h2></article>)}
      </section>

      <section>
        <form onSubmit={(event) => { event.preventDefault(); load().catch((error) => setMessage(error.message)); }} style={{ display: "flex", gap: 8 }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search providers" />
          <button type="submit">Search</button>
        </form>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20 }}>
        <form onSubmit={(event) => submit(event, "PROVIDER")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Add provider</h2>
          <input name="providerCode" placeholder="Provider code" required />
          <input name="providerName" placeholder="Provider name" required />
          <select name="category" defaultValue="PAYMENTS"><option>PAYMENTS</option><option>IDENTITY</option><option>COMPLIANCE</option><option>CREDIT</option><option>VALUATION</option><option>COMMUNICATIONS</option><option>ESIGNATURE</option><option>OPEN_BANKING</option><option>OTHER</option></select>
          <input name="baseUrl" placeholder="Base URL" />
          <input name="credentialReference" placeholder="Secret reference (not secret value)" />
          <button type="submit">Create provider</button>
        </form>

        <form onSubmit={(event) => submit(event, "CONNECTION")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Add connection</h2>
          <select name="providerId" required defaultValue=""><option value="" disabled>Select provider</option>{workspace.providers.map((provider) => <option key={String(provider.provider_id)} value={String(provider.provider_id)}>{String(provider.provider_name)}</option>)}</select>
          <input name="connectionName" placeholder="Connection name" required />
          <select name="environment" defaultValue="PRODUCTION"><option>SANDBOX</option><option>TEST</option><option>PRODUCTION</option></select>
          <input name="capabilities" placeholder="ACH,WIRE,KYC,ESIGN" />
          <button type="submit">Create connection</button>
        </form>

        <form onSubmit={(event) => submit(event, "JOB")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Queue job</h2>
          <select name="connectionId" required defaultValue=""><option value="" disabled>Select active connection</option>{workspace.connections.filter((connection) => connection.status === "ACTIVE").map((connection) => <option key={String(connection.connection_id)} value={String(connection.connection_id)}>{String(connection.provider_name)} — {String(connection.connection_name)}</option>)}</select>
          <input name="operation" placeholder="Operation" required />
          <select name="direction" defaultValue="OUTBOUND"><option>OUTBOUND</option><option>INBOUND</option></select>
          <input name="idempotencyKey" placeholder="Idempotency key" />
          <input name="sourceEntityType" placeholder="Source entity type" />
          <input name="sourceEntityId" placeholder="Source entity ID" />
          <button type="submit">Queue job</button>
        </form>

        <form onSubmit={(event) => submit(event, "RECONCILIATION")} style={{ display: "grid", gap: 8, border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Start reconciliation</h2>
          <select name="connectionId" required defaultValue=""><option value="" disabled>Select connection</option>{workspace.connections.map((connection) => <option key={String(connection.connection_id)} value={String(connection.connection_id)}>{String(connection.provider_name)} — {String(connection.connection_name)}</option>)}</select>
          <input type="date" name="reconciliationDate" required />
          <input name="reconciliationType" placeholder="ACH_SETTLEMENT" required />
          <button type="submit">Create reconciliation</button>
        </form>
      </section>

      <section>
        <h2>Providers</h2>
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>{workspace.providers.map((provider) => <tr key={String(provider.provider_id)}><td>{String(provider.provider_code)}</td><td>{String(provider.provider_name)}</td><td>{String(provider.category)}</td><td>{String(provider.status)}</td><td><button onClick={() => action("PROVIDER",provider.provider_id,provider.status === "ACTIVE" ? "DEACTIVATE" : "ACTIVATE")}>{provider.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>
      </section>

      <section>
        <h2>Connections</h2>
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Provider</th><th>Connection</th><th>Environment</th><th>Status</th><th>Health</th><th>Actions</th></tr></thead><tbody>{workspace.connections.map((connection) => <tr key={String(connection.connection_id)}><td>{String(connection.provider_name)}</td><td>{String(connection.connection_name)}</td><td>{String(connection.environment)}</td><td>{String(connection.status)}</td><td>{String(connection.last_health_status || "Not checked")}</td><td><button onClick={() => action("CONNECTION",connection.connection_id,connection.status === "ACTIVE" ? "DEACTIVATE" : "ACTIVATE")}>{connection.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>
      </section>

      <section>
        <h2>Integration jobs</h2>
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Provider</th><th>Operation</th><th>Direction</th><th>Status</th><th>Attempts</th><th>Error</th><th>Actions</th></tr></thead><tbody>{workspace.jobs.map((job) => <tr key={String(job.integration_job_id)}><td>{String(job.provider_name)}</td><td>{String(job.operation)}</td><td>{String(job.direction)}</td><td>{String(job.status)}</td><td>{String(job.attempt_count)}/{String(job.max_attempts)}</td><td>{String(job.error_message || "")}</td><td>{job.status === "QUEUED" && <button onClick={() => action("JOB",job.integration_job_id,"START")}>Start</button>} {job.status === "PROCESSING" && <button onClick={() => action("JOB",job.integration_job_id,"SUCCEED")}>Succeed</button>} {job.status === "FAILED" && <button onClick={() => action("JOB",job.integration_job_id,"RETRY")}>Retry</button>}</td></tr>)}</tbody></table></div>
      </section>

      <section>
        <h2>Reconciliations</h2>
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Date</th><th>Provider</th><th>Type</th><th>Status</th><th>Matched</th><th>Exceptions</th><th>Actions</th></tr></thead><tbody>{workspace.reconciliations.map((item) => <tr key={String(item.reconciliation_id)}><td>{String(item.reconciliation_date)}</td><td>{String(item.provider_name)}</td><td>{String(item.reconciliation_type)}</td><td>{String(item.status)}</td><td>{String(item.matched_count)}</td><td>{String(item.exception_count)}</td><td>{item.status === "OPEN" && <button onClick={() => action("RECONCILIATION",item.reconciliation_id,"START")}>Start</button>} {item.status === "IN_PROGRESS" && <button onClick={() => action("RECONCILIATION",item.reconciliation_id,"BALANCE")}>Balance</button>}</td></tr>)}</tbody></table></div>
      </section>
    </main>
  );
}
