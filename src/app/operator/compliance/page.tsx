"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Summary = {
  high_risk_customers?: number;
  open_alerts?: number;
  open_cases?: number;
  reviews_due?: number;
  elevated_risks?: number;
};

type Workspace = {
  profiles: Array<Record<string, unknown>>;
  alerts: Array<Record<string, unknown>>;
  cases: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  summary: Summary;
};

const emptyWorkspace: Workspace = { profiles: [], alerts: [], cases: [], risks: [], summary: {} };

function value(row: Record<string, unknown>, key: string) {
  const item = row[key];
  return item === null || item === undefined || item === "" ? "—" : String(item);
}

export default function CompliancePage() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ entityType: "ALERT", alertType: "TRANSACTION_MONITORING", severity: "MEDIUM", score: "50", summary: "", caseType: "AML_INVESTIGATION", priority: "MEDIUM", title: "", category: "OPERATIONAL", likelihood: "3", impact: "3", residualScore: "6" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/operator/compliance?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "COMPLIANCE_UNAVAILABLE");
      setWorkspace(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "COMPLIANCE_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  async function createItem(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/operator/compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        score: Number(form.score),
        likelihood: Number(form.likelihood),
        impact: Number(form.impact),
        residualScore: Number(form.residualScore),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "COMPLIANCE_UNAVAILABLE");
      return;
    }
    setForm((current) => ({ ...current, summary: "", title: "" }));
    await load();
  }

  async function updateItem(itemType: string, itemId: string, action: string) {
    const response = await fetch("/api/operator/compliance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType, itemId, action }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "COMPLIANCE_UNAVAILABLE");
      return;
    }
    await load();
  }

  const cards = [
    ["High-risk customers", workspace.summary.high_risk_customers || 0],
    ["Open AML alerts", workspace.summary.open_alerts || 0],
    ["Open cases", workspace.summary.open_cases || 0],
    ["Reviews due", workspace.summary.reviews_due || 0],
    ["Elevated risks", workspace.summary.elevated_risks || 0],
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Phase 10</p>
          <h1 className="text-3xl font-semibold">Compliance & Risk</h1>
          <p className="max-w-3xl text-sm text-slate-400">KYC, CIP, AML alerting, investigations, regulatory case management, and enterprise risk oversight.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-5">
          {cards.map(([label, count]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{count}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className="flex gap-3">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search profiles, alerts, and cases" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500" />
              <button onClick={() => void load()} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950">Search</button>
            </div>

            {error && <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>}
            {loading && <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Loading compliance workspace…</div>}

            <section className="rounded-2xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 px-5 py-4"><h2 className="font-semibold">AML Alert Queue</h2></div>
              <div className="divide-y divide-slate-800">
                {workspace.alerts.map((alert) => (
                  <article key={value(alert,"aml_alert_id")} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="font-medium">{value(alert,"alert_number")} · {value(alert,"alert_type")}</p><p className="text-sm text-slate-400">{value(alert,"summary")}</p></div>
                      <span className="rounded-full border border-slate-700 px-3 py-1 text-xs">{value(alert,"severity")} · {value(alert,"status")}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void updateItem("ALERT",value(alert,"aml_alert_id"),"START_REVIEW")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Start review</button>
                      <button onClick={() => void updateItem("ALERT",value(alert,"aml_alert_id"),"ESCALATE")} className="rounded-lg border border-amber-700 px-3 py-2 text-xs text-amber-300">Escalate</button>
                      <button onClick={() => void updateItem("ALERT",value(alert,"aml_alert_id"),"CLOSE")} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs text-emerald-300">Close</button>
                    </div>
                  </article>
                ))}
                {!loading && workspace.alerts.length === 0 && <p className="px-5 py-8 text-sm text-slate-500">No alerts found.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 px-5 py-4"><h2 className="font-semibold">Compliance Cases</h2></div>
              <div className="divide-y divide-slate-800">
                {workspace.cases.map((item) => (
                  <article key={value(item,"compliance_case_id")} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div><p className="font-medium">{value(item,"case_number")} · {value(item,"title")}</p><p className="text-sm text-slate-400">{value(item,"case_type")} · Due {value(item,"due_date")}</p></div>
                    <div className="flex items-center gap-2"><span className="text-xs text-slate-400">{value(item,"priority")} · {value(item,"status")}</span><button onClick={() => void updateItem("CASE",value(item,"compliance_case_id"),"START_REVIEW")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Review</button></div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 px-5 py-4"><h2 className="font-semibold">Enterprise Risk Register</h2></div>
              <div className="divide-y divide-slate-800">
                {workspace.risks.map((risk) => (
                  <article key={value(risk,"risk_item_id")} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div><p className="font-medium">{value(risk,"risk_number")} · {value(risk,"title")}</p><p className="text-sm text-slate-400">{value(risk,"category")} · Review {value(risk,"review_date")}</p></div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-xs">Residual {value(risk,"residual_score")} · {value(risk,"status")}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">Create Compliance Record</h2>
            <form onSubmit={createItem} className="mt-5 space-y-4">
              <select value={form.entityType} onChange={(event) => setForm({ ...form, entityType: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm">
                <option value="ALERT">AML Alert</option><option value="CASE">Compliance Case</option><option value="RISK">Risk Item</option>
              </select>
              {form.entityType === "ALERT" && <>
                <input value={form.alertType} onChange={(event) => setForm({ ...form, alertType: event.target.value })} placeholder="Alert type" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" />
                <select value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select>
                <input value={form.score} onChange={(event) => setForm({ ...form, score: event.target.value })} type="number" min="0" max="100" placeholder="Score" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" />
                <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} placeholder="Alert summary" className="min-h-28 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" required />
              </>}
              {form.entityType === "CASE" && <>
                <input value={form.caseType} onChange={(event) => setForm({ ...form, caseType: event.target.value })} placeholder="Case type" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" />
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select>
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Case title" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" required />
              </>}
              {form.entityType === "RISK" && <>
                <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Risk category" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" />
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Risk title" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" required />
                <div className="grid grid-cols-3 gap-2"><input value={form.likelihood} onChange={(event) => setForm({ ...form, likelihood: event.target.value })} type="number" min="1" max="5" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" /><input value={form.impact} onChange={(event) => setForm({ ...form, impact: event.target.value })} type="number" min="1" max="5" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" /><input value={form.residualScore} onChange={(event) => setForm({ ...form, residualScore: event.target.value })} type="number" min="1" max="25" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" /></div>
              </>}
              <button type="submit" className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950">Create record</button>
            </form>
          </aside>
        </section>
      </div>
    </main>
  );
}