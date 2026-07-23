"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Gavel, Loader2, Plus, RefreshCw, Search, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type DecisionRow = {
  credit_decision_id: string;
  underwriting_case_id: string;
  loan_package_id: string;
  package_number: string;
  customer_name: string;
  loan_type: string;
  status: string;
  decision_type: string | null;
  requested_amount: string;
  approved_amount: string | null;
  currency_code: string;
  authority_level: string;
  committee_required: boolean;
  exception_requested: boolean;
  exception_reason: string | null;
  final_conditions: string | null;
  risk_score: string | null;
  recommendation: string | null;
  approval_count: number;
};

type Recommendation = {
  underwriting_case_id: string;
  package_number: string;
  customer_name: string;
  requested_amount: string;
  currency_code: string;
  recommendation: string | null;
};

type ApiError = { error?: string };

type StatCard = { label: string; value: number; Icon: LucideIcon };

function money(value: string | null, currency = "USD") {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount) : "—";
}

function readableError(code?: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using credit approvals.",
    CREDIT_UNDERWRITING_CASE_REQUIRED: "Choose an underwriting recommendation.",
    CREDIT_RECOMMENDATION_NOT_FOUND: "The underwriting recommendation could not be found.",
    CREDIT_DECISION_EXISTS: "A credit decision already exists for that case.",
    CREDIT_DECISION_NOT_FOUND: "The credit decision could not be found.",
    CREDIT_EXCEPTION_REASON_REQUIRED: "Enter an exception reason.",
    CREDIT_APPROVED_AMOUNT_INVALID: "Approved amount must be valid and cannot exceed the request.",
    CREDIT_APPROVAL_UNAVAILABLE: "The credit approval workspace is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

export default function CreditApprovalPage() {
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [eligible, setEligible] = useState<Recommendation[]>([]);
  const [selected, setSelected] = useState<DecisionRow | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/credit?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const body = await response.json() as { decisions?: DecisionRow[]; eligibleRecommendations?: Recommendation[] } & ApiError;
      if (response.status === 401) return window.location.assign("/operator/login");
      if (!response.ok) throw new Error(body.error || "CREDIT_APPROVAL_UNAVAILABLE");
      const rows = body.decisions || [];
      setDecisions(rows);
      setEligible(body.eligibleRecommendations || []);
      setSelected((current) => current ? rows.find((row) => row.credit_decision_id === current.credit_decision_id) || null : null);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats: StatCard[] = useMemo(() => [
    { label: "Decision queue", value: decisions.length, Icon: Gavel },
    { label: "Pending review", value: decisions.filter((row) => ["PENDING", "IN_REVIEW"].includes(row.status)).length, Icon: ShieldAlert },
    { label: "Approved", value: decisions.filter((row) => ["APPROVED", "CONDITIONAL_APPROVAL"].includes(row.status)).length, Icon: CheckCircle2 },
  ], [decisions]);

  async function createDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/operator/credit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "CREDIT_APPROVAL_UNAVAILABLE");
      form.reset(); setShowCreate(false); setNotice("Credit decision created and added to the committee queue."); await load(query);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally { setSaving(false); }
  }

  async function action(payload: Record<string, unknown>, success: string) {
    if (!selected) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/operator/credit", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ creditDecisionId: selected.credit_decision_id, ...payload }) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "CREDIT_APPROVAL_UNAVAILABLE");
      setNotice(success); await load(query);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-[#020504] text-slate-100">
      <header className="border-b border-emerald-400/15 bg-black/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div><p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Operator</p><h1 className="text-lg font-semibold text-white">Credit Committee & Approval Engine</h1></div>
          <nav className="flex gap-4 text-sm"><a href="/operator/underwriting" className="text-slate-400 hover:text-white">Underwriting</a><a href="/operator/loans" className="text-slate-400 hover:text-white">Loans</a><a href="/operator/collateral" className="text-slate-400 hover:text-white">Collateral</a></nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 md:grid-cols-3">{stats.map(({ label, value, Icon }) => <div key={label} className="border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-400">{label}</p><Icon className="h-5 w-5 text-emerald-300" /></div><p className="mt-4 text-3xl font-semibold">{value}</p></div>)}</section>

        <section className="mt-6 border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="flex w-full max-w-xl gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search package, borrower, or loan type" className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none focus:border-emerald-400/50" /></div><button className="h-11 border border-white/10 px-4 text-sm">Search</button><button type="button" onClick={() => void load(query)} className="flex h-11 w-11 items-center justify-center border border-white/10"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></form>
            <button onClick={() => setShowCreate((value) => !value)} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black"><Plus className="h-4 w-4" />New decision</button>
          </div>

          {showCreate && <form onSubmit={createDecision} className="grid gap-4 border-b border-emerald-400/15 bg-emerald-400/[0.035] p-5"><label className="text-sm text-slate-300">Underwriting recommendation<select name="underwritingCaseId" required className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="">Choose a recommendation</option>{eligible.map((item) => <option key={item.underwriting_case_id} value={item.underwriting_case_id}>{item.package_number} — {item.customer_name} — {money(item.requested_amount, item.currency_code)} — {item.recommendation}</option>)}</select></label><div className="flex justify-end"><button disabled={saving} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create decision</button></div></form>}

          {(notice || error) && <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || notice}</div>}

          <div className="grid lg:grid-cols-[1.35fr_0.65fr]">
            <div className="overflow-x-auto border-r border-white/10"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Package</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Request</th><th className="px-5 py-4">Authority</th><th className="px-5 py-4">Risk</th><th className="px-5 py-4">Approvals</th></tr></thead><tbody className="divide-y divide-white/10">{loading ? <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-400"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />Loading decision queue</td></tr> : decisions.length === 0 ? <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-500">No credit decisions found.</td></tr> : decisions.map((item) => <tr key={item.credit_decision_id} onClick={() => setSelected(item)} className={`cursor-pointer hover:bg-white/[0.03] ${selected?.credit_decision_id === item.credit_decision_id ? "bg-emerald-400/[0.05]" : ""}`}><td className="px-5 py-4"><p className="font-medium text-white">{item.package_number}</p><p className="mt-1 text-xs text-slate-500">{item.customer_name} · {item.loan_type}</p></td><td className="px-5 py-4"><span className="border border-white/10 px-2 py-1 text-xs">{item.status}</span></td><td className="px-5 py-4">{money(item.requested_amount, item.currency_code)}</td><td className="px-5 py-4">{item.authority_level}</td><td className="px-5 py-4">{item.risk_score || "—"}</td><td className="px-5 py-4">{item.approval_count}</td></tr>)}</tbody></table></div>

            <aside className="p-5">{!selected ? <div className="py-16 text-center text-sm text-slate-500">Select a decision to review.</div> : <div className="space-y-5"><div><p className="text-xs uppercase tracking-wider text-emerald-300">Selected decision</p><h2 className="mt-2 text-xl font-semibold">{selected.package_number}</h2><p className="mt-1 text-sm text-slate-400">{selected.customer_name} · {selected.authority_level}</p></div><button disabled={saving} onClick={() => void action({ action: "START_REVIEW" }, "Credit review started.")} className="h-10 w-full border border-emerald-400/30 bg-emerald-400/10 text-sm text-emerald-200">Start review</button><form onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()); void action({ action: "REQUEST_EXCEPTION", ...data }, "Exception request recorded."); }} className="space-y-3"><textarea name="exceptionReason" required rows={2} placeholder="Exception reason" className="w-full border border-white/10 bg-black/40 px-3 py-2 text-sm" /><button disabled={saving} className="h-10 w-full border border-amber-300/30 text-sm text-amber-200">Request exception</button></form><form onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()); void action({ action: "DECIDE", ...data }, "Final credit decision recorded."); }} className="space-y-3"><select name="decisionType" className="h-10 w-full border border-white/10 bg-black/60 px-3 text-sm"><option value="APPROVE">Approve</option><option value="CONDITIONAL_APPROVAL">Conditional approval</option><option value="DECLINE">Decline</option><option value="RETURN_FOR_INFORMATION">Return for information</option></select><input name="approvedAmount" type="number" min="0" step="0.01" defaultValue={selected.requested_amount} className="h-10 w-full border border-white/10 bg-black/40 px-3 text-sm" /><textarea name="finalConditions" rows={2} placeholder="Final conditions" className="w-full border border-white/10 bg-black/40 px-3 py-2 text-sm" /><textarea name="comments" rows={2} placeholder="Decision comments" className="w-full border border-white/10 bg-black/40 px-3 py-2 text-sm" /><button disabled={saving} className="h-10 w-full bg-emerald-400 text-sm font-semibold text-black">Record final decision</button></form></div>}</aside>
          </div>
        </section>
      </div>
    </main>
  );
}