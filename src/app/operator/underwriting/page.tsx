"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, FileWarning, Loader2, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type CaseRow = {
  underwriting_case_id: string;
  loan_package_id: string;
  package_number: string;
  customer_name: string;
  loan_type: string;
  status: string;
  priority: string;
  requested_amount: string;
  currency_code: string;
  risk_score: string | null;
  recommendation: string | null;
  open_conditions: number;
  missing_documents: number;
  requested_ltv: string | null;
};

type LoanOption = {
  loan_package_id: string;
  package_number: string;
  customer_name: string;
  loan_type: string;
  requested_amount: string;
  currency_code: string;
};

type ApiError = { error?: string };

function readableError(code?: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using underwriting.",
    UNDERWRITING_LOAN_REQUIRED: "Choose a loan package.",
    UNDERWRITING_CASE_EXISTS: "That loan package already has an underwriting case.",
    UNDERWRITING_CASE_NOT_FOUND: "The underwriting case could not be found.",
    UNDERWRITING_REQUIRED_CONDITIONS_OPEN: "Required conditions must be resolved before recommending approval.",
    UNDERWRITING_RISK_SCORE_INVALID: "Risk score must be between 0 and 1000.",
    UNDERWRITING_CONDITION_TITLE_REQUIRED: "Enter a condition title.",
    UNDERWRITING_NOTE_REQUIRED: "Enter a note.",
    UNDERWRITING_WORKSPACE_UNAVAILABLE: "The underwriting workspace is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

function money(value: string, currency = "USD") {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount) : "—";
}

export default function UnderwritingWorkspacePage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [eligibleLoans, setEligibleLoans] = useState<LoanOption[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/underwriting?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const body = await response.json() as { cases?: CaseRow[]; eligibleLoans?: LoanOption[] } & ApiError;
      if (response.status === 401) return window.location.assign("/operator/login");
      if (!response.ok) throw new Error(body.error || "UNDERWRITING_WORKSPACE_UNAVAILABLE");
      setCases(body.cases || []);
      setEligibleLoans(body.eligibleLoans || []);
      if (selected) setSelected((body.cases || []).find((item) => item.underwriting_case_id === selected.underwriting_case_id) || null);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => ({
    all: cases.length,
    active: cases.filter((item) => ["QUEUED", "IN_REVIEW", "CONDITIONAL"].includes(item.status)).length,
    exceptions: cases.filter((item) => item.open_conditions > 0 || item.missing_documents > 0).length,
  }), [cases]);

  const statCards: Array<{ label: string; value: number; Icon: LucideIcon }> = [
    { label: "Cases", value: totals.all, Icon: ClipboardCheck },
    { label: "Active review", value: totals.active, Icon: ShieldCheck },
    { label: "Exceptions", value: totals.exceptions, Icon: FileWarning },
  ];

  async function createCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/operator/underwriting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "UNDERWRITING_WORKSPACE_UNAVAILABLE");
      form.reset(); setShowCreate(false); setNotice("Underwriting case created and added to the review queue."); await load(query);
    } catch (requestError) { setError(readableError(requestError instanceof Error ? requestError.message : undefined)); }
    finally { setSaving(false); }
  }

  async function action(payload: Record<string, unknown>, success: string) {
    if (!selected) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/operator/underwriting", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ underwritingCaseId: selected.underwriting_case_id, ...payload }) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "UNDERWRITING_WORKSPACE_UNAVAILABLE");
      setNotice(success); await load(query);
    } catch (requestError) { setError(readableError(requestError instanceof Error ? requestError.message : undefined)); }
    finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-[#020504] text-slate-100">
      <header className="border-b border-emerald-400/15 bg-black/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div><p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Operator</p><h1 className="text-lg font-semibold text-white">Underwriting Workspace</h1></div>
          <nav className="flex gap-4 text-sm"><a href="/operator/loans" className="text-slate-400 hover:text-white">Loans</a><a href="/operator/collateral" className="text-slate-400 hover:text-white">Collateral</a><a href="/operator/documents" className="text-slate-400 hover:text-white">Documents</a></nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          {statCards.map(({ label, value, Icon }) => (
            <div key={label} className="border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-400">{label}</p><Icon className="h-5 w-5 text-emerald-300" /></div><p className="mt-4 text-3xl font-semibold">{value}</p></div>
          ))}
        </section>

        <section className="mt-6 border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="flex w-full max-w-xl gap-2">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search package, borrower, or loan type" className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none focus:border-emerald-400/50" /></div>
              <button className="h-11 border border-white/10 px-4 text-sm">Search</button>
              <button type="button" onClick={() => void load(query)} className="flex h-11 w-11 items-center justify-center border border-white/10"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
            </form>
            <button onClick={() => setShowCreate((value) => !value)} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black"><Plus className="h-4 w-4" />New case</button>
          </div>

          {showCreate && <form onSubmit={createCase} className="grid gap-4 border-b border-emerald-400/15 bg-emerald-400/[0.035] p-5 md:grid-cols-2">
            <label className="text-sm text-slate-300 md:col-span-2">Loan package<select name="loanPackageId" required className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="">Choose a package</option>{eligibleLoans.map((loan) => <option key={loan.loan_package_id} value={loan.loan_package_id}>{loan.package_number} — {loan.customer_name} — {money(loan.requested_amount, loan.currency_code)}</option>)}</select></label>
            <label className="text-sm text-slate-300">Priority<select name="priority" defaultValue="NORMAL" className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label>
            <label className="text-sm text-slate-300 md:col-span-2">Initial summary<textarea name="summary" rows={3} className="mt-2 w-full border border-white/10 bg-black/40 px-3 py-2" /></label>
            <div className="md:col-span-2 flex justify-end"><button disabled={saving} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create case</button></div>
          </form>}

          {(notice || error) && <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || notice}</div>}

          <div className="grid lg:grid-cols-[1.35fr_0.65fr]">
            <div className="overflow-x-auto border-r border-white/10">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Package</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Request</th><th className="px-5 py-4">Risk</th><th className="px-5 py-4">Conditions</th><th className="px-5 py-4">LTV</th></tr></thead>
                <tbody className="divide-y divide-white/10">{loading ? <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-400"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />Loading review queue</td></tr> : cases.length === 0 ? <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-500">No underwriting cases found.</td></tr> : cases.map((item) => <tr key={item.underwriting_case_id} onClick={() => setSelected(item)} className={`cursor-pointer hover:bg-white/[0.03] ${selected?.underwriting_case_id === item.underwriting_case_id ? "bg-emerald-400/[0.05]" : ""}`}><td className="px-5 py-4"><p className="font-medium text-white">{item.package_number}</p><p className="mt-1 text-xs text-slate-500">{item.customer_name} · {item.loan_type}</p></td><td className="px-5 py-4"><span className="border border-white/10 px-2 py-1 text-xs">{item.priority} · {item.status}</span></td><td className="px-5 py-4">{money(item.requested_amount, item.currency_code)}</td><td className="px-5 py-4">{item.risk_score || "—"}</td><td className="px-5 py-4">{item.open_conditions} open · {item.missing_documents} docs</td><td className="px-5 py-4">{item.requested_ltv ? `${item.requested_ltv}%` : "—"}</td></tr>)}</tbody>
              </table>
            </div>

            <aside className="p-5">{!selected ? <div className="py-16 text-center text-sm text-slate-500">Select a case to review.</div> : <div className="space-y-5"><div><p className="text-xs uppercase tracking-wider text-emerald-300">Selected case</p><h2 className="mt-2 text-xl font-semibold">{selected.package_number}</h2><p className="mt-1 text-sm text-slate-400">{selected.customer_name}</p></div>
              <button disabled={saving} onClick={() => void action({ action: "START_REVIEW" }, "Review started.")} className="h-10 w-full border border-emerald-400/30 bg-emerald-400/10 text-sm text-emerald-200">Start review</button>
              <form onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()); void action({ action: "SAVE_ASSESSMENT", ...data }, "Assessment saved."); }} className="space-y-3"><input name="riskScore" type="number" min="0" max="1000" step="0.001" defaultValue={selected.risk_score || ""} placeholder="Risk score 0–1000" className="h-10 w-full border border-white/10 bg-black/40 px-3 text-sm" /><textarea name="summary" defaultValue="" placeholder="Underwriting summary" rows={3} className="w-full border border-white/10 bg-black/40 px-3 py-2 text-sm" /><button disabled={saving} className="h-10 w-full border border-white/10 text-sm">Save assessment</button></form>
              <form onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()); void action({ action: "ADD_CONDITION", ...data }, "Condition added."); event.currentTarget.reset(); }} className="space-y-3"><select name="conditionType" className="h-10 w-full border border-white/10 bg-black/60 px-3 text-sm"><option>DOCUMENT</option><option>IDENTITY</option><option>INCOME</option><option>CREDIT</option><option>COLLATERAL</option><option>VALUATION</option><option>TITLE</option><option>INSURANCE</option><option>COMPLIANCE</option><option>OTHER</option></select><input name="conditionTitle" required placeholder="Condition title" className="h-10 w-full border border-white/10 bg-black/40 px-3 text-sm" /><textarea name="conditionDescription" rows={2} placeholder="Condition details" className="w-full border border-white/10 bg-black/40 px-3 py-2 text-sm" /><button disabled={saving} className="h-10 w-full border border-white/10 text-sm">Add condition</button></form>
              <form onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()); void action({ action: "ADD_NOTE", ...data }, "Internal note recorded."); event.currentTarget.reset(); }} className="space-y-3"><select name="noteType" className="h-10 w-full border border-white/10 bg-black/60 px-3 text-sm"><option>INTERNAL</option><option>RISK</option><option>DOCUMENT</option><option>COLLATERAL</option><option>DECISION</option></select><textarea name="noteText" required rows={3} placeholder="Internal note" className="w-full border border-white/10 bg-black/40 px-3 py-2 text-sm" /><button disabled={saving} className="h-10 w-full border border-white/10 text-sm">Add note</button></form>
              <div className="grid gap-2"><button disabled={saving} onClick={() => void action({ action: "RECOMMEND", recommendation: "APPROVE" }, "Approval recommendation recorded.")} className="h-10 bg-emerald-400 text-sm font-semibold text-black">Recommend approval</button><button disabled={saving} onClick={() => void action({ action: "RECOMMEND", recommendation: "CONDITIONAL_APPROVAL" }, "Conditional approval recommendation recorded.")} className="h-10 border border-amber-300/30 text-sm text-amber-200">Conditional approval</button><button disabled={saving} onClick={() => void action({ action: "RECOMMEND", recommendation: "DECLINE" }, "Decline recommendation recorded.")} className="h-10 border border-red-300/30 text-sm text-red-200">Recommend decline</button></div>
            </div>}</aside>
          </div>
        </section>
      </div>
    </main>
  );
}
