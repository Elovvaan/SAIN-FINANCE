"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CalendarClock, CircleDollarSign, Loader2, Plus, RefreshCw, Search, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ServicingLoan = {
  servicing_loan_id: string;
  loan_package_id: string;
  account_number: string;
  package_number: string;
  customer_name: string;
  loan_type: string;
  currency_code: string;
  status: string;
  delinquency_status: string;
  original_principal: string;
  principal_balance: string;
  annual_interest_rate: string;
  next_due_date: string;
  next_payment_amount: string;
  escrow_balance: string;
  late_fee_balance: string;
  days_past_due: number;
  payment_count: number;
  total_paid: string;
};

type EligibleLoan = {
  loan_package_id: string;
  package_number: string;
  customer_name: string;
  loan_type: string;
  approved_amount: string | null;
  currency_code: string;
};

type ApiError = { error?: string };
type StatCard = { label: string; value: string | number; Icon: LucideIcon };

function money(value: string | null | undefined, currency = "USD") {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount) : "—";
}

function readableError(code?: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using servicing.",
    SERVICING_LOAN_PACKAGE_REQUIRED: "Choose an approved or funded loan.",
    SERVICING_ELIGIBLE_LOAN_NOT_FOUND: "The selected loan is not eligible for servicing.",
    SERVICING_LOAN_EXISTS: "That loan has already been boarded into servicing.",
    SERVICING_LOAN_NOT_FOUND: "The servicing account could not be found.",
    SERVICING_RATE_INVALID: "Enter a valid annual interest rate as a decimal, such as 0.065.",
    SERVICING_TERM_INVALID: "Enter a valid loan term and amortization period.",
    SERVICING_DATE_INVALID: "Enter valid origination and first-payment dates.",
    SERVICING_PAYMENT_AMOUNT_INVALID: "Enter a payment amount greater than zero.",
    SERVICING_PAYMENT_TYPE_INVALID: "Choose a supported payment type.",
    SERVICING_ESCROW_AMOUNT_INVALID: "Enter a valid annual escrow amount.",
    SERVICING_UNAVAILABLE: "The servicing workspace is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

export default function ServicingPage() {
  const [loans, setLoans] = useState<ServicingLoan[]>([]);
  const [eligible, setEligible] = useState<EligibleLoan[]>([]);
  const [selected, setSelected] = useState<ServicingLoan | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/servicing?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const body = await response.json() as { loans?: ServicingLoan[]; eligibleLoans?: EligibleLoan[] } & ApiError;
      if (response.status === 401) return window.location.assign("/operator/login");
      if (!response.ok) throw new Error(body.error || "SERVICING_UNAVAILABLE");
      const rows = body.loans || [];
      setLoans(rows);
      setEligible(body.eligibleLoans || []);
      setSelected((current) => current ? rows.find((row) => row.servicing_loan_id === current.servicing_loan_id) || null : null);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats: StatCard[] = useMemo(() => {
    const totalBalance = loans.reduce((sum, loan) => sum + Number(loan.principal_balance || 0), 0);
    return [
      { label: "Active accounts", value: loans.filter((loan) => loan.status === "ACTIVE").length, Icon: Banknote },
      { label: "Portfolio balance", value: new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(totalBalance), Icon: CircleDollarSign },
      { label: "Past due", value: loans.filter((loan) => loan.days_past_due > 0).length, Icon: TriangleAlert },
      { label: "Due in 30 days", value: loans.filter((loan) => {
        const due = new Date(`${loan.next_due_date}T00:00:00`);
        const now = new Date();
        return due >= now && due.getTime() - now.getTime() <= 30 * 86400000;
      }).length, Icon: CalendarClock },
    ];
  }, [loans]);

  async function boardLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/operator/servicing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "SERVICING_UNAVAILABLE");
      form.reset(); setShowBoard(false); setNotice("Loan boarded into servicing and payment schedule generated."); await load(query);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally { setSaving(false); }
  }

  async function action(payload: Record<string, unknown>, success: string) {
    if (!selected) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/operator/servicing", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ servicingLoanId: selected.servicing_loan_id, ...payload }) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "SERVICING_UNAVAILABLE");
      setNotice(success); await load(query);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-[#020504] text-slate-100">
      <header className="border-b border-emerald-400/15 bg-black/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div><p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Operator</p><h1 className="text-lg font-semibold text-white">Loan Servicing</h1></div>
          <nav className="flex gap-4 text-sm"><a href="/operator/credit" className="text-slate-400 hover:text-white">Credit</a><a href="/operator/underwriting" className="text-slate-400 hover:text-white">Underwriting</a><a href="/operator/loans" className="text-slate-400 hover:text-white">Loans</a></nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 md:grid-cols-4">{stats.map(({ label, value, Icon }) => <div key={label} className="border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-400">{label}</p><Icon className="h-5 w-5 text-emerald-300" /></div><p className="mt-4 text-2xl font-semibold">{value}</p></div>)}</section>

        <section className="mt-6 border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="flex w-full max-w-xl gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search account, package, borrower, or loan type" className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none focus:border-emerald-400/50" /></div><button className="h-11 border border-white/10 px-4 text-sm">Search</button><button type="button" onClick={() => void load(query)} className="flex h-11 w-11 items-center justify-center border border-white/10"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></form>
            <button onClick={() => setShowBoard((value) => !value)} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black"><Plus className="h-4 w-4" />Board loan</button>
          </div>

          {showBoard && <form onSubmit={boardLoan} className="grid gap-4 border-b border-emerald-400/15 bg-emerald-400/[0.035] p-5 md:grid-cols-2"><label className="text-sm text-slate-300 md:col-span-2">Approved or funded loan<select name="loanPackageId" required className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="">Choose a loan</option>{eligible.map((item) => <option key={item.loan_package_id} value={item.loan_package_id}>{item.package_number} — {item.customer_name} — {money(item.approved_amount, item.currency_code)}</option>)}</select></label><label className="text-sm text-slate-300">Annual rate<input name="annualInterestRate" type="number" min="0" max="1" step="0.000001" required placeholder="0.065" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label><label className="text-sm text-slate-300">Term months<input name="termMonths" type="number" min="1" required className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label><label className="text-sm text-slate-300">Amortization months<input name="amortizationMonths" type="number" min="1" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label><label className="text-sm text-slate-300">Origination date<input name="originationDate" type="date" required className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label><label className="text-sm text-slate-300">First payment date<input name="firstPaymentDate" type="date" required className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label><div className="flex items-end justify-end"><button disabled={saving} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Generate servicing account</button></div></form>}

          {(notice || error) && <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || notice}</div>}

          <div className="grid lg:grid-cols-[1.35fr_0.65fr]">
            <div className="overflow-x-auto border-r border-white/10"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Account</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Principal</th><th className="px-5 py-4">Next payment</th><th className="px-5 py-4">Due date</th><th className="px-5 py-4">Past due</th></tr></thead><tbody className="divide-y divide-white/10">{loading ? <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-400"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />Loading servicing portfolio</td></tr> : loans.length === 0 ? <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-500">No servicing accounts found.</td></tr> : loans.map((loan) => <tr key={loan.servicing_loan_id} onClick={() => setSelected(loan)} className={`cursor-pointer hover:bg-white/[0.03] ${selected?.servicing_loan_id === loan.servicing_loan_id ? "bg-emerald-400/[0.05]" : ""}`}><td className="px-5 py-4"><p className="font-medium text-white">{loan.account_number}</p><p className="mt-1 text-xs text-slate-500">{loan.package_number} · {loan.customer_name}</p></td><td className="px-5 py-4"><span className="border border-white/10 px-2 py-1 text-xs">{loan.status}</span><p className="mt-2 text-xs text-slate-500">{loan.delinquency_status}</p></td><td className="px-5 py-4">{money(loan.principal_balance, loan.currency_code)}</td><td className="px-5 py-4">{money(loan.next_payment_amount, loan.currency_code)}</td><td className="px-5 py-4">{loan.next_due_date}</td><td className="px-5 py-4">{loan.days_past_due} days</td></tr>)}</tbody></table></div>

            <aside className="p-5">{!selected ? <div className="py-16 text-center text-sm text-slate-500">Select a servicing account.</div> : <div className="space-y-5"><div><p className="text-xs uppercase tracking-wider text-emerald-300">Selected account</p><h2 className="mt-2 text-xl font-semibold">{selected.account_number}</h2><p className="mt-1 text-sm text-slate-400">{selected.customer_name} · {money(selected.principal_balance, selected.currency_code)}</p></div><button disabled={saving} onClick={() => void action({ action: "REFRESH_DELINQUENCY" }, "Delinquency status refreshed.")} className="h-10 w-full border border-amber-300/30 text-sm text-amber-200">Refresh delinquency</button><form onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()); void action({ action: "POST_PAYMENT", ...data }, "Payment posted to the servicing account."); }} className="space-y-3"><select name="paymentType" className="h-10 w-full border border-white/10 bg-black/60 px-3 text-sm"><option value="REGULAR">Regular payment</option><option value="PARTIAL">Partial payment</option><option value="EXTRA_PRINCIPAL">Extra principal</option><option value="INTEREST_ONLY">Interest only</option><option value="ESCROW_ONLY">Escrow only</option><option value="PAYOFF">Payoff</option></select><input name="amount" type="number" min="0.01" step="0.01" required placeholder="Payment amount" className="h-10 w-full border border-white/10 bg-black/40 px-3 text-sm" /><input name="effectiveDate" type="date" required className="h-10 w-full border border-white/10 bg-black/40 px-3 text-sm" /><input name="externalReference" placeholder="External reference" className="h-10 w-full border border-white/10 bg-black/40 px-3 text-sm" /><textarea name="notes" rows={2} placeholder="Payment notes" className="w-full border border-white/10 bg-black/40 px-3 py-2 text-sm" /><button disabled={saving} className="h-10 w-full bg-emerald-400 text-sm font-semibold text-black">Post payment</button></form><form onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()); void action({ action: "ADD_ESCROW_ITEM", ...data }, "Escrow item added."); }} className="space-y-3 border-t border-white/10 pt-5"><select name="escrowType" className="h-10 w-full border border-white/10 bg-black/60 px-3 text-sm"><option value="PROPERTY_TAX">Property tax</option><option value="HOMEOWNERS_INSURANCE">Homeowners insurance</option><option value="FLOOD_INSURANCE">Flood insurance</option><option value="PMI">PMI</option><option value="HOA">HOA</option><option value="OTHER">Other</option></select><input name="payeeName" placeholder="Payee name" className="h-10 w-full border border-white/10 bg-black/40 px-3 text-sm" /><input name="annualAmount" type="number" min="0" step="0.01" required placeholder="Annual amount" className="h-10 w-full border border-white/10 bg-black/40 px-3 text-sm" /><button disabled={saving} className="h-10 w-full border border-emerald-400/30 bg-emerald-400/10 text-sm text-emerald-200">Add escrow item</button></form></div>}</aside>
          </div>
        </section>
      </div>
    </main>
  );
}