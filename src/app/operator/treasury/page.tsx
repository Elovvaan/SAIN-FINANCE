"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Landmark, Loader2, RefreshCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type TreasuryAccount = {
  treasury_account_id: string;
  account_number: string;
  account_name: string;
  account_type: string;
  currency_code: string;
  available_balance: string;
  ledger_balance: string;
  minimum_balance: string;
  status: string;
};

type TreasuryPayment = {
  treasury_payment_id: string;
  payment_number: string;
  payment_type: string;
  direction: string;
  status: string;
  amount: string;
  currency_code: string;
  beneficiary_name: string | null;
  beneficiary_reference: string | null;
  external_reference: string | null;
  requested_execution_date: string;
  source_account_number: string | null;
  source_account_name: string | null;
  destination_account_number: string | null;
  destination_account_name: string | null;
  return_reason: string | null;
};

type Summary = { total_available: string; total_ledger: string; liquidity_alerts: number };
type ApiError = { error?: string };
type StatCard = { label: string; value: string; Icon: LucideIcon };

function money(value: string | number, currency = "USD") {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount) : "—";
}

function readableError(code?: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using treasury operations.",
    TREASURY_PAYMENT_TYPE_INVALID: "Choose a valid payment type.",
    TREASURY_DIRECTION_INVALID: "Choose a valid payment direction.",
    TREASURY_AMOUNT_INVALID: "Enter a payment amount greater than zero.",
    TREASURY_ACCOUNT_REQUIRED: "Select a source or destination treasury account.",
    TREASURY_INTERNAL_ACCOUNTS_INVALID: "Internal transfers require two different treasury accounts.",
    TREASURY_EXECUTION_DATE_REQUIRED: "Choose an execution date.",
    TREASURY_PAYMENT_NOT_FOUND: "The selected payment could not be found.",
    TREASURY_ACTION_INVALID: "That action is not allowed for the current payment status.",
    TREASURY_RETURN_REASON_REQUIRED: "Enter a reason for the return.",
    TREASURY_INSUFFICIENT_AVAILABLE_BALANCE: "The source account does not have enough available balance.",
    TREASURY_UNAVAILABLE: "The treasury workspace is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

export default function TreasuryPage() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [payments, setPayments] = useState<TreasuryPayment[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_available: "0", total_ledger: "0", liquidity_alerts: 0 });
  const [selected, setSelected] = useState<TreasuryPayment | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (search = "") => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/operator/treasury?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const body = await response.json() as { accounts?: TreasuryAccount[]; payments?: TreasuryPayment[]; summary?: Summary } & ApiError;
      if (response.status === 401) return window.location.assign("/operator/login");
      if (!response.ok) throw new Error(body.error || "TREASURY_UNAVAILABLE");
      const rows = body.payments || [];
      setAccounts(body.accounts || []); setPayments(rows); setSummary(body.summary || { total_available: "0", total_ledger: "0", liquidity_alerts: 0 });
      setSelected((current) => current ? rows.find((row) => row.treasury_payment_id === current.treasury_payment_id) || null : null);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats: StatCard[] = useMemo(() => [
    { label: "Available liquidity", value: money(summary.total_available), Icon: Landmark },
    { label: "Pending authorization", value: String(payments.filter((item) => item.status === "PENDING_AUTHORIZATION").length), Icon: ShieldCheck },
    { label: "Liquidity alerts", value: String(summary.liquidity_alerts), Icon: TriangleAlert },
  ], [payments, summary]);

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/operator/treasury", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resource: "PAYMENT", ...payload }) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "TREASURY_UNAVAILABLE");
      form.reset(); setNotice("Treasury payment created in draft status."); await load(query);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally { setSaving(false); }
  }

  async function action(actionName: string, returnReason = "") {
    if (!selected) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/operator/treasury", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ treasuryPaymentId: selected.treasury_payment_id, action: actionName, returnReason }) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "TREASURY_UNAVAILABLE");
      setNotice(`Payment action completed: ${actionName.toLowerCase()}.`); await load(query);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-[#020504] text-slate-100">
      <header className="border-b border-emerald-400/15 bg-black/70"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><div><p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Operator</p><h1 className="text-lg font-semibold text-white">Treasury & Payments</h1></div><nav className="flex gap-4 text-sm"><a href="/operator/ledger" className="text-slate-400 hover:text-white">Ledger</a><a href="/operator/servicing" className="text-slate-400 hover:text-white">Servicing</a><a href="/operator/credit" className="text-slate-400 hover:text-white">Credit</a></nav></div></header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 md:grid-cols-3">{stats.map(({ label, value, Icon }) => <div key={label} className="border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-400">{label}</p><Icon className="h-5 w-5 text-emerald-300" /></div><p className="mt-4 text-3xl font-semibold">{value}</p></div>)}</section>
        <section className="mt-6 grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="border border-white/10 bg-white/[0.025] p-5"><h2 className="text-base font-semibold">Create payment instruction</h2><p className="mt-1 text-sm text-slate-500">Creates an internal treasury workflow record. External rail transmission remains a separate integration.</p><form onSubmit={createPayment} className="mt-5 space-y-3"><div className="grid gap-3 sm:grid-cols-2"><select name="paymentType" required className="h-11 border border-white/10 bg-black/60 px-3 text-sm"><option value="INTERNAL_TRANSFER">Internal transfer</option><option value="WIRE">Wire</option><option value="ACH">ACH</option><option value="CASHIERS_CHECK">Cashier&apos;s check</option><option value="ESCROW_DISBURSEMENT">Escrow disbursement</option><option value="CONSTRUCTION_DRAW">Construction draw</option></select><select name="direction" required className="h-11 border border-white/10 bg-black/60 px-3 text-sm"><option value="OUTBOUND">Outbound</option><option value="INBOUND">Inbound</option><option value="INTERNAL">Internal</option></select></div><div className="grid gap-3 sm:grid-cols-2"><input name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount" className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /><input name="requestedExecutionDate" type="date" required className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /></div><select name="sourceTreasuryAccountId" className="h-11 w-full border border-white/10 bg-black/60 px-3 text-sm"><option value="">Source account</option>{accounts.filter((a) => a.status === "ACTIVE").map((a) => <option key={a.treasury_account_id} value={a.treasury_account_id}>{a.account_number} — {a.account_name} — {money(a.available_balance,a.currency_code)}</option>)}</select><select name="destinationTreasuryAccountId" className="h-11 w-full border border-white/10 bg-black/60 px-3 text-sm"><option value="">Destination account</option>{accounts.filter((a) => a.status === "ACTIVE").map((a) => <option key={a.treasury_account_id} value={a.treasury_account_id}>{a.account_number} — {a.account_name}</option>)}</select><input name="beneficiaryName" placeholder="Beneficiary name" className="h-11 w-full border border-white/10 bg-black/40 px-3 text-sm" /><div className="grid gap-3 sm:grid-cols-2"><input name="beneficiaryReference" placeholder="Beneficiary reference" className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /><input name="externalReference" placeholder="External reference" className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /></div><button disabled={saving || accounts.length === 0} className="inline-flex h-11 w-full items-center justify-center gap-2 bg-emerald-400 text-sm font-semibold text-black disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create payment</button></form></div>
          <div className="border border-white/10 bg-white/[0.025]"><div className="flex gap-2 border-b border-white/10 p-5"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search payment or beneficiary" className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm" /></div><button onClick={() => void load(query)} className="flex h-11 w-11 items-center justify-center border border-white/10"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>{(notice || error) && <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || notice}</div>}<div className="grid lg:grid-cols-[1.2fr_0.8fr]"><div className="overflow-x-auto border-r border-white/10"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Execution</th></tr></thead><tbody className="divide-y divide-white/10">{loading ? <tr><td colSpan={4} className="px-4 py-16 text-center text-slate-500"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />Loading payments</td></tr> : payments.length === 0 ? <tr><td colSpan={4} className="px-4 py-16 text-center text-slate-500">No treasury payments found.</td></tr> : payments.map((p) => <tr key={p.treasury_payment_id} onClick={() => setSelected(p)} className={`cursor-pointer hover:bg-white/[0.03] ${selected?.treasury_payment_id === p.treasury_payment_id ? "bg-emerald-400/[0.05]" : ""}`}><td className="px-4 py-4"><p className="font-medium text-white">{p.payment_number}</p><p className="mt-1 text-xs text-slate-500">{p.payment_type} · {p.beneficiary_name || "No beneficiary"}</p></td><td className="px-4 py-4"><span className="border border-white/10 px-2 py-1 text-xs">{p.status}</span></td><td className="px-4 py-4">{money(p.amount,p.currency_code)}</td><td className="px-4 py-4">{p.requested_execution_date}</td></tr>)}</tbody></table></div><aside className="p-5">{!selected ? <div className="py-16 text-center text-sm text-slate-500">Select a payment.</div> : <div className="space-y-4"><div><p className="text-xs uppercase tracking-wider text-emerald-300">Selected payment</p><h2 className="mt-2 font-semibold">{selected.payment_number}</h2><p className="mt-1 text-sm text-slate-400">{selected.source_account_number || "External"} → {selected.destination_account_number || selected.beneficiary_name || "External"}</p></div><div className="grid gap-2"><button disabled={saving || selected.status !== "DRAFT"} onClick={() => void action("SUBMIT")} className="h-10 border border-white/10 text-sm disabled:opacity-30">Submit</button><button disabled={saving || selected.status !== "PENDING_AUTHORIZATION"} onClick={() => void action("AUTHORIZE")} className="h-10 border border-emerald-400/30 text-sm text-emerald-200 disabled:opacity-30">Authorize</button><button disabled={saving || selected.status !== "AUTHORIZED"} onClick={() => void action("RELEASE")} className="h-10 bg-emerald-400 text-sm font-semibold text-black disabled:opacity-30">Release</button><button disabled={saving || selected.status !== "RELEASED"} onClick={() => void action("SETTLE")} className="h-10 border border-cyan-300/30 text-sm text-cyan-200 disabled:opacity-30">Mark settled</button><button disabled={saving || !["DRAFT","PENDING_AUTHORIZATION","AUTHORIZED"].includes(selected.status)} onClick={() => void action("CANCEL")} className="h-10 border border-red-300/20 text-sm text-red-200 disabled:opacity-30">Cancel</button></div><form onSubmit={(e) => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get("returnReason") || ""); void action("RETURN",reason); }} className="space-y-2"><input name="returnReason" required placeholder="Return reason" className="h-10 w-full border border-white/10 bg-black/40 px-3 text-sm" /><button disabled={saving || !["RELEASED","SETTLED"].includes(selected.status)} className="h-10 w-full border border-amber-300/30 text-sm text-amber-200 disabled:opacity-30">Return payment</button></form></div>}</aside></div></div>
        </section>
        <section className="mt-6 border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-emerald-300" /><h2 className="font-semibold">Treasury positions</h2></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{accounts.map((a) => <div key={a.treasury_account_id} className="border border-white/10 p-4"><div className="flex items-start justify-between"><div><p className="font-medium">{a.account_name}</p><p className="mt-1 text-xs text-slate-500">{a.account_number} · {a.account_type}</p></div><span className="text-xs text-slate-400">{a.status}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-500">Available</p><p className="mt-1">{money(a.available_balance,a.currency_code)}</p></div><div><p className="text-xs text-slate-500">Ledger</p><p className="mt-1">{money(a.ledger_balance,a.currency_code)}</p></div></div></div>)}</div></section>
      </div>
    </main>
  );
}
