"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

type Summary = {
  active_clients: number;
  active_products: number;
  active_credentials: number;
  active_webhooks: number;
  requests_last_24_hours: number;
  server_errors_last_24_hours: number;
};

type ApiClient = {
  api_client_id: string;
  client_name: string;
  client_code: string;
  description: string | null;
  status: string;
  client_type: string;
  scopes: string[];
};

type ApiProduct = {
  api_product_id: string;
  product_code: string;
  product_name: string;
  description: string | null;
  base_path: string;
  version: string;
  status: string;
  default_rate_limit: number;
};

type ApiCredential = {
  api_credential_id: string;
  api_client_id: string;
  credential_type: string;
  public_identifier: string;
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  client_name: string;
  client_code: string;
};

type ApiWebhook = {
  api_webhook_id: string;
  api_client_id: string;
  webhook_name: string;
  endpoint_url: string;
  event_types: string[];
  status: string;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  client_name: string;
};

type ApiLog = {
  api_request_log_id: string;
  request_id: string;
  http_method: string;
  request_path: string;
  response_status: number | null;
  duration_ms: number | null;
  source_ip: string | null;
  created_at: string;
  client_name: string | null;
  product_name: string | null;
};

type Workspace = {
  clients: ApiClient[];
  products: ApiProduct[];
  credentials: ApiCredential[];
  webhooks: ApiWebhook[];
  logs: ApiLog[];
  summary: Summary;
};

const emptyWorkspace: Workspace = {
  clients: [],
  products: [],
  credentials: [],
  webhooks: [],
  logs: [],
  summary: {
    active_clients: 0,
    active_products: 0,
    active_credentials: 0,
    active_webhooks: 0,
    requests_last_24_hours: 0,
    server_errors_last_24_hours: 0,
  },
};

export default function PublicApiPlatformPage() {
  const [workspace,setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [query,setQuery] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [issuedSecret,setIssuedSecret] = useState("");
  const [clientForm,setClientForm] = useState({ clientName: "", clientCode: "", clientType: "CONFIDENTIAL", description: "", scopes: "" });
  const [productForm,setProductForm] = useState({ productCode: "", productName: "", basePath: "/api/v1", version: "v1", defaultRateLimit: "1000", description: "" });
  const [credentialForm,setCredentialForm] = useState({ apiClientId: "", credentialType: "API_KEY", expiresAt: "" });
  const [webhookForm,setWebhookForm] = useState({ apiClientId: "", webhookName: "", endpointUrl: "", eventTypes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/operator/public-api?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json() as Workspace & { error?: string };
      if (!response.ok) throw new Error(data.error || "API_PLATFORM_UNAVAILABLE");
      setWorkspace(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "API_PLATFORM_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  },[query]);

  useEffect(() => { void load(); },[load]);

  useEffect(() => {
    if (!credentialForm.apiClientId && workspace.clients[0]) {
      setCredentialForm((current) => ({ ...current, apiClientId: workspace.clients[0].api_client_id }));
    }
    if (!webhookForm.apiClientId && workspace.clients[0]) {
      setWebhookForm((current) => ({ ...current, apiClientId: workspace.clients[0].api_client_id }));
    }
  },[workspace.clients,credentialForm.apiClientId,webhookForm.apiClientId]);

  const summaryCards = useMemo<Array<[string,number]>>(() => [
    ["Active clients",Number(workspace.summary.active_clients || 0)],
    ["Active products",Number(workspace.summary.active_products || 0)],
    ["Active credentials",Number(workspace.summary.active_credentials || 0)],
    ["Active webhooks",Number(workspace.summary.active_webhooks || 0)],
    ["Requests in 24 hours",Number(workspace.summary.requests_last_24_hours || 0)],
    ["Server errors in 24 hours",Number(workspace.summary.server_errors_last_24_hours || 0)],
  ],[workspace.summary]);

  async function post(body: Record<string,unknown>) {
    setError("");
    const response = await fetch("/api/operator/public-api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string; secret?: string; signingSecret?: string };
    if (!response.ok) { setError(data.error || "API_PLATFORM_UNAVAILABLE"); return null; }
    if (data.secret) setIssuedSecret(data.secret);
    if (data.signingSecret) setIssuedSecret(data.signingSecret);
    await load();
    return data;
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await post({
      entityType: "CLIENT",
      ...clientForm,
      scopes: clientForm.scopes.split(",").map((value) => value.trim()).filter(Boolean),
    });
    if (result) setClientForm({ clientName: "", clientCode: "", clientType: "CONFIDENTIAL", description: "", scopes: "" });
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await post({ entityType: "PRODUCT", ...productForm, defaultRateLimit: Number(productForm.defaultRateLimit) });
    if (result) setProductForm({ productCode: "", productName: "", basePath: "/api/v1", version: "v1", defaultRateLimit: "1000", description: "" });
  }

  async function createCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIssuedSecret("");
    await post({ entityType: "CREDENTIAL", ...credentialForm });
  }

  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIssuedSecret("");
    const result = await post({
      entityType: "WEBHOOK",
      ...webhookForm,
      eventTypes: webhookForm.eventTypes.split(",").map((value) => value.trim()).filter(Boolean),
    });
    if (result) setWebhookForm((current) => ({ ...current, webhookName: "", endpointUrl: "", eventTypes: "" }));
  }

  async function act(itemType: string,itemId: string,action: string) {
    setError("");
    const response = await fetch("/api/operator/public-api", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemType,itemId,action }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error || "API_PLATFORM_UNAVAILABLE"); return; }
    await load();
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7 }}>Phase 19</p>
        <h1 style={{ marginBottom: 8 }}>Public API Platform</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>Client onboarding, API products, credentials, webhooks, usage monitoring, and operational controls.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        {summaryCards.map(([label,value]) => <Metric key={label} label={label} value={value} />)}
      </section>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search API clients" style={{ minWidth: 260, padding: 10 }} />
        <button onClick={() => void load()} disabled={loading}>Refresh</button>
      </section>

      {error ? <p role="alert" style={{ padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>{error}</p> : null}
      {issuedSecret ? <section style={panelStyle}><strong>Copy this secret now. It will not be shown again.</strong><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{issuedSecret}</pre></section> : null}

      <section style={panelStyle}>
        <h2>Create API client</h2>
        <form onSubmit={createClient} style={formStyle}>
          <input required value={clientForm.clientName} onChange={(event) => setClientForm({ ...clientForm, clientName: event.target.value })} placeholder="Client name" />
          <input required value={clientForm.clientCode} onChange={(event) => setClientForm({ ...clientForm, clientCode: event.target.value })} placeholder="Client code" />
          <select value={clientForm.clientType} onChange={(event) => setClientForm({ ...clientForm, clientType: event.target.value })}>
            {['CONFIDENTIAL','PUBLIC','SERVICE'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <input value={clientForm.scopes} onChange={(event) => setClientForm({ ...clientForm, scopes: event.target.value })} placeholder="Scopes, comma separated" />
          <input value={clientForm.description} onChange={(event) => setClientForm({ ...clientForm, description: event.target.value })} placeholder="Description" />
          <button type="submit">Create client</button>
        </form>
      </section>

      <section style={panelStyle}>
        <h2>Create API product</h2>
        <form onSubmit={createProduct} style={formStyle}>
          <input required value={productForm.productCode} onChange={(event) => setProductForm({ ...productForm, productCode: event.target.value })} placeholder="Product code" />
          <input required value={productForm.productName} onChange={(event) => setProductForm({ ...productForm, productName: event.target.value })} placeholder="Product name" />
          <input required value={productForm.basePath} onChange={(event) => setProductForm({ ...productForm, basePath: event.target.value })} placeholder="Base path" />
          <input required value={productForm.version} onChange={(event) => setProductForm({ ...productForm, version: event.target.value })} placeholder="Version" />
          <input type="number" min="1" required value={productForm.defaultRateLimit} onChange={(event) => setProductForm({ ...productForm, defaultRateLimit: event.target.value })} placeholder="Rate limit" />
          <input value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} placeholder="Description" />
          <button type="submit">Create product</button>
        </form>
      </section>

      <section style={panelStyle}>
        <h2>Issue credential</h2>
        <form onSubmit={createCredential} style={formStyle}>
          <select required value={credentialForm.apiClientId} onChange={(event) => setCredentialForm({ ...credentialForm, apiClientId: event.target.value })}>
            <option value="">Select client</option>
            {workspace.clients.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.api_client_id} value={item.api_client_id}>{item.client_name}</option>)}
          </select>
          <select value={credentialForm.credentialType} onChange={(event) => setCredentialForm({ ...credentialForm, credentialType: event.target.value })}>
            {['API_KEY','CLIENT_SECRET','MTLS'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <input type="datetime-local" value={credentialForm.expiresAt} onChange={(event) => setCredentialForm({ ...credentialForm, expiresAt: event.target.value })} />
          <button type="submit">Issue credential</button>
        </form>
      </section>

      <section style={panelStyle}>
        <h2>Create webhook</h2>
        <form onSubmit={createWebhook} style={formStyle}>
          <select required value={webhookForm.apiClientId} onChange={(event) => setWebhookForm({ ...webhookForm, apiClientId: event.target.value })}>
            <option value="">Select client</option>
            {workspace.clients.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.api_client_id} value={item.api_client_id}>{item.client_name}</option>)}
          </select>
          <input required value={webhookForm.webhookName} onChange={(event) => setWebhookForm({ ...webhookForm, webhookName: event.target.value })} placeholder="Webhook name" />
          <input required type="url" value={webhookForm.endpointUrl} onChange={(event) => setWebhookForm({ ...webhookForm, endpointUrl: event.target.value })} placeholder="https://example.com/webhooks" />
          <input value={webhookForm.eventTypes} onChange={(event) => setWebhookForm({ ...webhookForm, eventTypes: event.target.value })} placeholder="Event types, comma separated" />
          <button type="submit">Create webhook</button>
        </form>
      </section>

      <section style={panelStyle}>
        <h2>API clients</h2>
        <Table columns={["Code","Client","Type","Scopes","Status","Actions"]} rows={workspace.clients.map((item) => [
          item.client_code,
          item.client_name,
          item.client_type,
          Array.isArray(item.scopes) ? item.scopes.join(", ") || "—" : "—",
          item.status,
          <div key={item.api_client_id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {item.status === "ACTIVE" ? <button onClick={() => void act("CLIENT",item.api_client_id,"DEACTIVATE")}>Deactivate</button> : <button onClick={() => void act("CLIENT",item.api_client_id,"ACTIVATE")}>Activate</button>}
            {item.status !== "ARCHIVED" ? <button onClick={() => void act("CLIENT",item.api_client_id,"ARCHIVE")}>Archive</button> : null}
          </div>,
        ])} />
      </section>

      <section style={panelStyle}>
        <h2>API products</h2>
        <Table columns={["Code","Name","Path","Version","Rate limit","Status","Actions"]} rows={workspace.products.map((item) => [
          item.product_code,
          item.product_name,
          item.base_path,
          item.version,
          item.default_rate_limit,
          item.status,
          <div key={item.api_product_id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {item.status === "ACTIVE" ? <button onClick={() => void act("PRODUCT",item.api_product_id,"DEACTIVATE")}>Deactivate</button> : <button onClick={() => void act("PRODUCT",item.api_product_id,"ACTIVATE")}>Activate</button>}
          </div>,
        ])} />
      </section>

      <section style={panelStyle}>
        <h2>Credentials</h2>
        <Table columns={["Client","Type","Identifier","Expires","Last used","Status","Actions"]} rows={workspace.credentials.map((item) => [
          item.client_name,
          item.credential_type,
          item.public_identifier,
          item.expires_at ? new Date(item.expires_at).toLocaleString() : "Never",
          item.last_used_at ? new Date(item.last_used_at).toLocaleString() : "Never",
          item.status,
          <div key={item.api_credential_id}>{item.status === "ACTIVE" ? <button onClick={() => void act("CREDENTIAL",item.api_credential_id,"REVOKE")}>Revoke</button> : null}</div>,
        ])} />
      </section>

      <section style={panelStyle}>
        <h2>Webhooks</h2>
        <Table columns={["Client","Webhook","Endpoint","Events","Last delivery","Status","Actions"]} rows={workspace.webhooks.map((item) => [
          item.client_name,
          item.webhook_name,
          item.endpoint_url,
          Array.isArray(item.event_types) ? item.event_types.join(", ") || "—" : "—",
          item.last_delivery_at ? `${new Date(item.last_delivery_at).toLocaleString()} · ${item.last_delivery_status || "UNKNOWN"}` : "Never",
          item.status,
          <div key={item.api_webhook_id}>{item.status === "ACTIVE" ? <button onClick={() => void act("WEBHOOK",item.api_webhook_id,"DEACTIVATE")}>Deactivate</button> : <button onClick={() => void act("WEBHOOK",item.api_webhook_id,"ACTIVATE")}>Activate</button>}</div>,
        ])} />
      </section>

      <section style={panelStyle}>
        <h2>Recent API requests</h2>
        <Table columns={["Time","Client","Product","Method","Path","Status","Duration"]} rows={workspace.logs.map((item) => [
          new Date(item.created_at).toLocaleString(),
          item.client_name || "Unknown",
          item.product_name || "Unassigned",
          item.http_method,
          item.request_path,
          item.response_status == null ? "—" : item.response_status,
          item.duration_ms == null ? "—" : `${item.duration_ms} ms`,
        ])} />
      </section>

      {loading ? <p>Loading public API platform…</p> : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article style={panelStyle}><small>{label}</small><h2 style={{ marginBottom: 0 }}>{value}</h2></article>;
}

function Table({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{columns.map((column) => <th key={column} style={cellStyle}>{column}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map((row,index) => <tr key={index}>{row.map((cell,cellIndex) => <td key={cellIndex} style={cellStyle}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} style={cellStyle}>No records</td></tr>}</tbody>
      </table>
    </div>
  );
}

const panelStyle = { border: "1px solid #d7d7d7", borderRadius: 12, padding: 16 };
const formStyle = { display: "grid", gap: 10 };
const cellStyle = { padding: 10, borderBottom: "1px solid #e2e2e2", textAlign: "left" as const, verticalAlign: "top" as const };
