"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

type Summary = {
  active_mfa_methods: number;
  trusted_devices: number;
  active_sessions: number;
  high_risk_events: number;
  critical_findings: number;
  keys_due_rotation: number;
  recovery_tests_due: number;
};

type Workspace = {
  methods: Array<Record<string,unknown>>;
  devices: Array<Record<string,unknown>>;
  sessions: Array<Record<string,unknown>>;
  policies: Array<Record<string,unknown>>;
  keys: Array<Record<string,unknown>>;
  secrets: Array<Record<string,unknown>>;
  events: Array<Record<string,unknown>>;
  findings: Array<Record<string,unknown>>;
  recoveryPlans: Array<Record<string,unknown>>;
  summary: Summary;
};

const emptyWorkspace: Workspace = {
  methods: [], devices: [], sessions: [], policies: [], keys: [], secrets: [], events: [], findings: [], recoveryPlans: [],
  summary: { active_mfa_methods: 0, trusted_devices: 0, active_sessions: 0, high_risk_events: 0, critical_findings: 0, keys_due_rotation: 0, recovery_tests_due: 0 },
};

const panelStyle = { border: "1px solid #d7d7d7", borderRadius: 12, padding: 16 } as const;
const formStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 } as const;

export default function EnterpriseSecurityPage() {
  const [workspace,setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [query,setQuery] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [form,setForm] = useState<Record<string,string>>({ entityType: "EVENT", severity: "MEDIUM", decision: "DENY", methodType: "TOTP", trustLevel: "STANDARD", planType: "DISASTER_RECOVERY" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/operator/security?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json() as Workspace & { error?: string };
      if (!response.ok) throw new Error(data.error || "SECURITY_UNAVAILABLE");
      setWorkspace(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SECURITY_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  },[query]);

  useEffect(() => { void load(); },[load]);

  const summaryCards = useMemo<Array<[string,number]>>(() => [
    ["Active MFA methods",Number(workspace.summary.active_mfa_methods || 0)],
    ["Trusted devices",Number(workspace.summary.trusted_devices || 0)],
    ["Active sessions",Number(workspace.summary.active_sessions || 0)],
    ["High-risk events",Number(workspace.summary.high_risk_events || 0)],
    ["Critical findings",Number(workspace.summary.critical_findings || 0)],
    ["Keys due rotation",Number(workspace.summary.keys_due_rotation || 0)],
    ["Recovery tests due",Number(workspace.summary.recovery_tests_due || 0)],
  ],[workspace.summary]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/operator/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error || "SECURITY_UNAVAILABLE"); return; }
    setForm((current) => ({ entityType: current.entityType, severity: "MEDIUM", decision: "DENY", methodType: "TOTP", trustLevel: "STANDARD", planType: "DISASTER_RECOVERY" }));
    await load();
  }

  async function act(itemType: string,itemId: string,action: string) {
    setError("");
    const response = await fetch("/api/operator/security", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemType,itemId,action }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error || "SECURITY_UNAVAILABLE"); return; }
    await load();
  }

  const field = (name: string,placeholder: string,type = "text") => <input type={type} value={form[name] || ""} onChange={(event) => setForm({ ...form, [name]: event.target.value })} placeholder={placeholder} />;

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7 }}>Phase 18</p>
        <h1 style={{ marginBottom: 8 }}>Enterprise Security</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>Identity assurance, device trust, zero-trust policy, encryption, secrets, threat monitoring, findings, and recovery readiness.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        {summaryCards.map(([label,value]) => <article key={label} style={panelStyle}><small>{label}</small><h2 style={{ marginBottom: 0 }}>{value}</h2></article>)}
      </section>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search security identities" style={{ minWidth: 260, padding: 10 }} />
        <button onClick={() => void load()} disabled={loading}>Refresh</button>
      </section>

      {error ? <p role="alert" style={{ padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>{error}</p> : null}

      <section style={panelStyle}>
        <h2>Register security control</h2>
        <form onSubmit={submit} style={formStyle}>
          <select value={form.entityType} onChange={(event) => setForm({ entityType: event.target.value, severity: "MEDIUM", decision: "DENY", methodType: "TOTP", trustLevel: "STANDARD", planType: "DISASTER_RECOVERY" })}>
            {['EVENT','FINDING','MFA_METHOD','DEVICE','POLICY','KEY','SECRET','RECOVERY_PLAN'].map((value) => <option key={value}>{value}</option>)}
          </select>

          {form.entityType === "EVENT" ? <>
            {field("eventType","Event type")}{field("source","Source")}{field("title","Title")}{field("description","Description")}
            <select value={form.severity || "MEDIUM"} onChange={(event) => setForm({ ...form, severity: event.target.value })}>{['INFO','LOW','MEDIUM','HIGH','CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select>
            {field("userId","User ID")}{field("ipAddress","IP address")}{field("riskScore","Risk score","number")}
          </> : null}

          {form.entityType === "FINDING" ? <>
            {field("findingCode","Finding code")}{field("findingType","Finding type")}{field("title","Title")}{field("description","Description")}
            <select value={form.severity || "MEDIUM"} onChange={(event) => setForm({ ...form, severity: event.target.value })}>{['LOW','MEDIUM','HIGH','CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select>
            {field("affectedAsset","Affected asset")}{field("ownerUserId","Owner user ID")}{field("targetDate","Target date","date")}
          </> : null}

          {form.entityType === "MFA_METHOD" ? <>
            {field("userId","User ID")}{field("displayName","Display name")}
            <select value={form.methodType || "TOTP"} onChange={(event) => setForm({ ...form, methodType: event.target.value })}>{['TOTP','SMS','EMAIL','WEBAUTHN','HARDWARE_KEY'].map((value) => <option key={value}>{value}</option>)}</select>
            {field("credentialId","Credential ID")}{field("secretReference","Secret reference")}
          </> : null}

          {form.entityType === "DEVICE" ? <>
            {field("userId","User ID")}{field("deviceName","Device name")}{field("deviceFingerprint","Device fingerprint")}{field("platform","Platform")}{field("browser","Browser")}{field("ipAddress","IP address")}
            <select value={form.trustLevel || "STANDARD"} onChange={(event) => setForm({ ...form, trustLevel: event.target.value })}>{['STANDARD','HIGH','PRIVILEGED'].map((value) => <option key={value}>{value}</option>)}</select>
          </> : null}

          {form.entityType === "POLICY" ? <>
            {field("policyCode","Policy code")}{field("policyName","Policy name")}{field("resourceType","Resource type")}{field("actionPattern","Action pattern")}
            <select value={form.decision || "DENY"} onChange={(event) => setForm({ ...form, decision: event.target.value })}>{['ALLOW','DENY','CHALLENGE'].map((value) => <option key={value}>{value}</option>)}</select>
            {field("priority","Priority","number")}{field("description","Description")}
          </> : null}

          {form.entityType === "KEY" ? <>
            {field("keyAlias","Key alias")}{field("keyPurpose","Key purpose")}{field("provider","Provider")}{field("providerKeyReference","Provider key reference")}{field("algorithm","Algorithm")}{field("rotationIntervalDays","Rotation days","number")}{field("nextRotationAt","Next rotation","datetime-local")}
          </> : null}

          {form.entityType === "SECRET" ? <>
            {field("secretName","Secret name")}{field("secretType","Secret type")}{field("vaultProvider","Vault provider")}{field("vaultReference","Vault reference")}{field("ownerTeam","Owner team")}{field("rotationIntervalDays","Rotation days","number")}{field("nextRotationAt","Next rotation","datetime-local")}
          </> : null}

          {form.entityType === "RECOVERY_PLAN" ? <>
            {field("planCode","Plan code")}{field("planName","Plan name")}
            <select value={form.planType || "DISASTER_RECOVERY"} onChange={(event) => setForm({ ...form, planType: event.target.value })}>{['DISASTER_RECOVERY','BUSINESS_CONTINUITY','CYBER_RECOVERY','DATA_RECOVERY'].map((value) => <option key={value}>{value}</option>)}</select>
            {field("businessService","Business service")}{field("recoveryTimeObjectiveMinutes","RTO minutes","number")}{field("recoveryPointObjectiveMinutes","RPO minutes","number")}{field("primaryOwner","Primary owner")}{field("runbookLocation","Runbook location")}{field("nextTestAt","Next test","datetime-local")}
          </> : null}

          <button type="submit">Create</button>
        </form>
      </section>

      <SecurityTable title="Security events" columns={["Severity","Title","Source","Status","Detected","Actions"]} rows={workspace.events.map((item) => [String(item.severity),String(item.title),String(item.source),String(item.status),String(item.detected_at),<div key={String(item.security_event_id)}>{item.status === "OPEN" ? <button onClick={() => void act("EVENT",String(item.security_event_id),"ACKNOWLEDGE")}>Acknowledge</button> : null} {item.status !== "RESOLVED" ? <button onClick={() => void act("EVENT",String(item.security_event_id),"RESOLVE")}>Resolve</button> : null}</div>])} />
      <SecurityTable title="Findings" columns={["Code","Title","Severity","Status","Target","Actions"]} rows={workspace.findings.map((item) => [String(item.finding_code),String(item.title),String(item.severity),String(item.status),String(item.target_date || "—"),<div key={String(item.security_finding_id)}>{item.status === "OPEN" ? <button onClick={() => void act("FINDING",String(item.security_finding_id),"START")}>Start</button> : null} {item.status === "IN_PROGRESS" ? <button onClick={() => void act("FINDING",String(item.security_finding_id),"REMEDIATE")}>Remediate</button> : null} {item.status === "REMEDIATED" ? <button onClick={() => void act("FINDING",String(item.security_finding_id),"VERIFY")}>Verify</button> : null}</div>])} />
      <SecurityTable title="Active sessions" columns={["User","Strength","Risk","Status","Expires","Actions"]} rows={workspace.sessions.map((item) => [String(item.user_id),String(item.authentication_strength),String(item.risk_score),String(item.status),String(item.expires_at),item.status === "ACTIVE" ? <button key={String(item.security_session_id)} onClick={() => void act("SESSION",String(item.security_session_id),"REVOKE")}>Revoke</button> : "—"])} />
      <SecurityTable title="Trusted devices" columns={["User","Device","Trust","Status","Last seen","Actions"]} rows={workspace.devices.map((item) => [String(item.user_id),String(item.device_name),String(item.trust_level),String(item.status),String(item.last_seen_at || "—"),item.status === "TRUSTED" ? <button key={String(item.security_trusted_device_id)} onClick={() => void act("DEVICE",String(item.security_trusted_device_id),"REVOKE")}>Revoke</button> : <button key={String(item.security_trusted_device_id)} onClick={() => void act("DEVICE",String(item.security_trusted_device_id),"TRUST")}>Trust</button>])} />
      <SecurityTable title="Zero-trust policies" columns={["Code","Name","Resource","Decision","Status","Actions"]} rows={workspace.policies.map((item) => [String(item.policy_code),String(item.policy_name),String(item.resource_type),String(item.decision),String(item.status),item.status === "ACTIVE" ? <button key={String(item.security_access_policy_id)} onClick={() => void act("POLICY",String(item.security_access_policy_id),"DEACTIVATE")}>Deactivate</button> : <button key={String(item.security_access_policy_id)} onClick={() => void act("POLICY",String(item.security_access_policy_id),"ACTIVATE")}>Activate</button>])} />
      <SecurityTable title="Encryption keys" columns={["Alias","Purpose","Provider","Version","Status","Actions"]} rows={workspace.keys.map((item) => [String(item.key_alias),String(item.key_purpose),String(item.provider),String(item.key_version),String(item.status),<div key={String(item.security_encryption_key_id)}><button onClick={() => void act("KEY",String(item.security_encryption_key_id),"ROTATE")}>Rotate</button> <button onClick={() => void act("KEY",String(item.security_encryption_key_id),"RETIRE")}>Retire</button></div>])} />
      <SecurityTable title="Secrets" columns={["Name","Type","Vault","Owner","Status","Actions"]} rows={workspace.secrets.map((item) => [String(item.secret_name),String(item.secret_type),String(item.vault_provider),String(item.owner_team || "—"),String(item.status),<div key={String(item.security_secret_id)}><button onClick={() => void act("SECRET",String(item.security_secret_id),"ROTATE")}>Rotate</button> <button onClick={() => void act("SECRET",String(item.security_secret_id),"REVOKE")}>Revoke</button></div>])} />
      <SecurityTable title="Recovery plans" columns={["Code","Service","Type","RTO/RPO","Status","Actions"]} rows={workspace.recoveryPlans.map((item) => [String(item.plan_code),String(item.business_service),String(item.plan_type),`${String(item.recovery_time_objective_minutes || "—")}/${String(item.recovery_point_objective_minutes || "—")} min`,String(item.status),<div key={String(item.security_recovery_plan_id)}><button onClick={() => void act("RECOVERY_PLAN",String(item.security_recovery_plan_id),"TEST_PASS")}>Test pass</button> <button onClick={() => void act("RECOVERY_PLAN",String(item.security_recovery_plan_id),"TEST_FAIL")}>Test fail</button></div>])} />

      {loading ? <p>Loading security workspace…</p> : null}
    </main>
  );
}

function SecurityTable({ title, columns, rows }: { title: string; columns: string[]; rows: ReactNode[][] }) {
  return <section style={panelStyle}><h2>{title}</h2><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{columns.map((column) => <th key={column} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #d7d7d7" }}>{column}</th>)}</tr></thead><tbody>{rows.map((row,index) => <tr key={index}>{row.map((cell,cellIndex) => <td key={cellIndex} style={{ padding: 8, borderBottom: "1px solid #ececec", verticalAlign: "top" }}>{cell}</td>)}</tr>)}</tbody></table></div></section>;
}
