"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, BriefcaseBusiness, Loader2, Plus, RefreshCw, Search, type LucideIcon } from "lucide-react";

type Loan = {
  loan_package_id: string;
  package_number: string;
  primary_customer_id: string;
  customer_name: string;
  loan_type: string;
  purpose: string | null;
  status: string;
  requested_amount: string;
  approved_amount: string | null;
  currency_code: string;
  interest_rate: string | null;
  term_months: number | null;
  collateral_count: number;
  total_collateral_value: string;
  requested_ltv: string | null;
  updated_at: string;
};

type Customer = { customer_id: string; display_name: string; customer_type: string; status: string };
type ApiError = { error?: string };

function readableError(code?: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using the loan repository.",
    CUSTOMER_NOT_FOUND: "The selected customer no longer exists.",
    LOAN_CUSTOMER_REQUIRED: "Select a primary borrower.",
    LOAN_TYPE_INVALID: "Choose a valid loan type.",
    LOAN_REQUESTED_AMOUNT_INVALID: "Enter a requested amount greater than zero.",
    LOAN_INTEREST_RATE_INVALID: "Interest rate must be between 0 and 100.",
    LOAN_TERM_INVALID: "Loan term must be a positive whole number.",
    LOAN_AMORTIZATION_INVALID: "Amortization must be a positive whole number.",
    LOAN_FEES_INVALID: "Fees cannot be negative.",
    LOAN_REPOSITORY_UNAVAILABLE: "The loan repository is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

function money(value: string | number | null, currency = "USD") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number.isFinite(amount) ? amount : 0);
}

export default function OperatorLoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLoans = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/loans?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const body = await response.json() as { loans?: Loan[]; customers?: Customer[] } & ApiError;
      if (response.status === 401) {
        window.location.assign("/operator/login");
        return;
      }
      if (!response.ok) throw new Error(body.error || "LOAN_REPOSITORY_UNAVAILABLE");
      setLoans(body.loans || []);
      setCustomers(body.customers || []);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadLoans(); }, [loadLoans]);

  const totals = useMemo(() => ({
    all: loans.length,
    requested: loans.reduce((sum, loan) => sum + Number(loan.requested_amount || 0), 0),
    review: loans.filter((loan) => ["SUBMITTED", "UNDER_REVIEW"].includes(loan.status)).length,
  }), [loans]);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadLoans(query);
  }

  async function createPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/operator/loans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { packageNumber?: string } & ApiError;
      if (response.status === 401) {
        window.location.assign("/operator/login");
        return;
      }
      if (!response.ok) throw new Error(body.error || "LOAN_REPOSITORY_UNAVAILABLE");
      form.reset();
      setShowCreate(false);
      setNotice(`Loan package ${body.packageNumber || ""} created in draft status.`);
      await loadLoans(query);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020504] text-slate-100">
      <header className="border-b border-emerald-400/15 bg-black/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">S</div>
            <div><p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Operator</p><h1 className="text-lg font-semibold text-white">Loan Package Repository</h1></div>
          </div>
          <nav className="flex gap-4 text-sm">
            <a href="/operator/customers" className="text-slate-400 hover:text-white">Customers</a>
            <a href="/operator/collateral" className="text-slate-400 hover:text-white">Collateral</a>
            <a href="/operator/documents" className="text-slate-400 hover:text-white">Documents</a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["Loan packages", totals.all, BriefcaseBusiness],
              ["Total requested", money(totals.requested), BadgeDollarSign],
              ["In review", totals.review, RefreshCw],
            ] as [string, number | string, LucideIcon][]
          ).map(([label, value, Icon]) => (
            <div key={String(label)} className="border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between"><p className="text-sm text-slate-400">{String(label)}</p><Icon className="h-5 w-5 text-emerald-300" /></div>
              <p className="mt-4 text-3xl font-semibold text-white">{String(value)}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={submitSearch} className="flex w-full max-w-xl gap-2">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search package, borrower, type, or purpose" className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none focus:border-emerald-400/50" /></div>
              <button className="h-11 border border-white/10 px-4 text-sm">Search</button>
              <button type="button" onClick={() => void loadLoans(query)} className="flex h-11 w-11 items-center justify-center border border-white/10" aria-label="Refresh loans"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
            </form>
            <button onClick={() => setShowCreate((value) => !value)} className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black"><Plus className={`h-4 w-4 ${showCreate ? "rotate-45" : ""}`} />{showCreate ? "Close" : "New loan package"}</button>
          </div>

          {showCreate && (
            <form onSubmit={createPackage} className="grid gap-4 border-b border-emerald-400/15 bg-emerald-400/[0.035] p-5 md:grid-cols-2">
              <label className="text-sm text-slate-300">Primary borrower<select name="primaryCustomerId" required className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="">Select customer</option>{customers.map((customer) => <option key={customer.customer_id} value={customer.customer_id}>{customer.display_name}</option>)}</select></label>
              <label className="text-sm text-slate-300">Loan type<select name="loanType" required defaultValue="REAL_ESTATE" className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="REAL_ESTATE">Real estate</option><option value="VEHICLE">Vehicle</option><option value="EQUIPMENT">Equipment</option><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="LINE_OF_CREDIT">Line of credit</option><option value="OTHER">Other</option></select></label>
              <label className="text-sm text-slate-300 md:col-span-2">Purpose<input name="purpose" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Requested amount<input name="requestedAmount" required type="number" min="0.01" step="0.01" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Currency<input name="currencyCode" defaultValue="USD" maxLength={3} className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3 uppercase" /></label>
              <label className="text-sm text-slate-300">Interest rate (%)<input name="interestRate" type="number" min="0" max="100" step="0.001" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Term (months)<input name="termMonths" type="number" min="1" step="1" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Payment frequency<select name="paymentFrequency" defaultValue="MONTHLY" className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="MONTHLY">Monthly</option><option value="BIWEEKLY">Biweekly</option><option value="WEEKLY">Weekly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option><option value="OTHER">Other</option></select></label>
              <label className="text-sm text-slate-300">Payment type<select name="paymentType" defaultValue="PRINCIPAL_AND_INTEREST" className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="PRINCIPAL_AND_INTEREST">Principal and interest</option><option value="INTEREST_ONLY">Interest only</option><option value="BALLOON">Balloon</option><option value="REVOLVING">Revolving</option><option value="OTHER">Other</option></select></label>
              <label className="text-sm text-slate-300">Amortization (months)<input name="amortizationMonths" type="number" min="1" step="1" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Origination fee<input name="originationFee" type="number" min="0" step="0.01" defaultValue="0" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Closing costs<input name="closingCosts" type="number" min="0" step="0.01" defaultValue="0" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="flex items-center gap-3 self-end pb-3 text-sm text-slate-300"><input name="balloonPayment" type="checkbox" /> Balloon payment</label>
              <label className="text-sm text-slate-300 md:col-span-2">Underwriting notes<textarea name="underwritingNotes" rows={3} className="mt-2 w-full border border-white/10 bg-black/40 px-3 py-2" /></label>
              <div className="md:col-span-2 flex justify-end"><button disabled={saving} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Creating" : "Create draft package"}</button></div>
            </form>
          )}

          {(notice || error) && <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || notice}</div>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Package</th><th className="px-5 py-4">Borrower</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Requested</th><th className="px-5 py-4">Collateral</th><th className="px-5 py-4">LTV</th><th className="px-5 py-4">Terms</th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {loading ? <tr><td colSpan={8} className="px-5 py-16 text-center text-slate-400"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-300" />Loading loan packages</td></tr> : loans.length === 0 ? <tr><td colSpan={8} className="px-5 py-16 text-center text-slate-500">No loan packages found.</td></tr> : loans.map((loan) => (
                  <tr key={loan.loan_package_id} className="hover:bg-white/[0.025]">
                    <td className="px-5 py-4"><p className="font-medium text-white">{loan.package_number}</p><p className="mt-1 text-xs text-slate-500">{loan.purpose || "No purpose entered"}</p></td>
                    <td className="px-5 py-4 text-slate-300">{loan.customer_name}</td>
                    <td className="px-5 py-4 text-slate-300">{loan.loan_type.replaceAll("_", " ")}</td>
                    <td className="px-5 py-4"><span className="border border-white/10 bg-white/[0.04] px-2 py-1 text-xs">{loan.status.replaceAll("_", " ")}</span></td>
                    <td className="px-5 py-4 font-medium text-white">{money(loan.requested_amount, loan.currency_code)}</td>
                    <td className="px-5 py-4 text-slate-400"><p>{loan.collateral_count} linked</p><p className="mt-1 text-xs">{money(loan.total_collateral_value, loan.currency_code)}</p></td>
                    <td className="px-5 py-4 text-slate-300">{loan.requested_ltv ? `${loan.requested_ltv}%` : "—"}</td>
                    <td className="px-5 py-4 text-slate-400"><p>{loan.interest_rate ? `${loan.interest_rate}%` : "Rate pending"}</p><p className="mt-1 text-xs">{loan.term_months ? `${loan.term_months} months` : "Term pending"}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}