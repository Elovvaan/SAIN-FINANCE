"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Plus, RefreshCw, Search, UserRound, Users } from "lucide-react";

type Customer = {
  customer_id: string;
  customer_type: "INDIVIDUAL" | "BUSINESS";
  status: string;
  display_name: string;
  legal_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state_region: string | null;
  country_code: string;
  updated_at: string;
};

type ApiError = { error?: string };

function readableError(code?: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using the customer repository.",
    CUSTOMER_DISPLAY_NAME_REQUIRED: "Enter a customer display name.",
    CUSTOMER_TYPE_INVALID: "Choose an individual or business customer type.",
    CUSTOMER_TAX_ID_LAST4_INVALID: "Tax ID must contain exactly four digits.",
    CUSTOMER_REPOSITORY_UNAVAILABLE: "The customer repository is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function OperatorCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [customerType, setCustomerType] = useState<"INDIVIDUAL" | "BUSINESS">("INDIVIDUAL");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/customers?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const body = await response.json() as { customers?: Customer[] } & ApiError;
      if (response.status === 401) {
        window.location.assign("/operator/login");
        return;
      }
      if (!response.ok) throw new Error(body.error || "CUSTOMER_REPOSITORY_UNAVAILABLE");
      setCustomers(body.customers || []);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  const totals = useMemo(() => ({
    all: customers.length,
    individuals: customers.filter((customer) => customer.customer_type === "INDIVIDUAL").length,
    businesses: customers.filter((customer) => customer.customer_type === "BUSINESS").length,
  }), [customers]);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadCustomers(query);
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch("/api/operator/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as ApiError;
      if (response.status === 401) {
        window.location.assign("/operator/login");
        return;
      }
      if (!response.ok) throw new Error(body.error || "CUSTOMER_REPOSITORY_UNAVAILABLE");
      form.reset();
      setCustomerType("INDIVIDUAL");
      setShowCreate(false);
      setNotice("Customer profile created and audit event recorded.");
      await loadCustomers(query);
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
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Operator</p>
              <h1 className="text-lg font-semibold text-white">Customer Repository</h1>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <a href="/operator/documents" className="text-slate-400 transition hover:text-white">Documents</a>
            <a href="/operator/operations" className="text-slate-400 transition hover:text-white">Operations</a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Customers", totals.all, Users],
            ["Individuals", totals.individuals, UserRound],
            ["Businesses", totals.businesses, Building2],
          ].map(([label, value, Icon]) => (
            <div key={String(label)} className="border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between"><p className="text-sm text-slate-400">{String(label)}</p><Icon className="h-5 w-5 text-emerald-300" /></div>
              <p className="mt-4 text-3xl font-semibold text-white">{String(value)}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={submitSearch} className="flex w-full max-w-xl gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, or phone" className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none focus:border-emerald-400/50" />
              </div>
              <button className="h-11 border border-white/10 px-4 text-sm">Search</button>
              <button type="button" onClick={() => void loadCustomers(query)} className="flex h-11 w-11 items-center justify-center border border-white/10" aria-label="Refresh customers"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
            </form>
            <button onClick={() => setShowCreate((current) => !current)} className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black"><Plus className={`h-4 w-4 ${showCreate ? "rotate-45" : ""}`} />{showCreate ? "Close" : "Add customer"}</button>
          </div>

          {showCreate && (
            <form onSubmit={createProfile} className="grid gap-4 border-b border-emerald-400/15 bg-emerald-400/[0.035] p-5 md:grid-cols-2">
              <label className="text-sm text-slate-300">Customer type
                <select name="customerType" value={customerType} onChange={(event) => setCustomerType(event.target.value as "INDIVIDUAL" | "BUSINESS")} className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3">
                  <option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option>
                </select>
              </label>
              <label className="text-sm text-slate-300">Status
                <select name="status" defaultValue="PROSPECT" className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3">
                  <option value="PROSPECT">Prospect</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="DECLINED">Declined</option>
                </select>
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">Display name<input name="displayName" required className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              {customerType === "INDIVIDUAL" ? <>
                <label className="text-sm text-slate-300">First name<input name="firstName" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
                <label className="text-sm text-slate-300">Last name<input name="lastName" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
                <label className="text-sm text-slate-300">Date of birth<input name="dateOfBirth" type="date" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              </> : <>
                <label className="text-sm text-slate-300">Business name<input name="businessName" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
                <label className="text-sm text-slate-300">Legal name<input name="legalName" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
                <label className="text-sm text-slate-300">Formation date<input name="formationDate" type="date" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              </>}
              <label className="text-sm text-slate-300">Email<input name="email" type="email" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Phone<input name="phone" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Tax ID last four<input name="taxIdLast4" maxLength={4} inputMode="numeric" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Address<input name="addressLine1" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">City<input name="city" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">State or region<input name="stateRegion" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300">Postal code<input name="postalCode" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
              <label className="text-sm text-slate-300 md:col-span-2">Internal notes<textarea name="notes" rows={3} className="mt-2 w-full border border-white/10 bg-black/40 px-3 py-2" /></label>
              <div className="md:col-span-2 flex justify-end"><button disabled={saving} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Creating" : "Create customer"}</button></div>
            </form>
          )}

          {(notice || error) && <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || notice}</div>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Contact</th><th className="px-5 py-4">Location</th><th className="px-5 py-4">Updated</th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {loading ? <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-400"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-300" />Loading customers</td></tr> : customers.length === 0 ? <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-500">No customers found.</td></tr> : customers.map((customer) => (
                  <tr key={customer.customer_id} className="hover:bg-white/[0.025]">
                    <td className="px-5 py-4"><p className="font-medium text-white">{customer.display_name}</p><p className="mt-1 text-xs text-slate-500">{customer.legal_name || customer.business_name || customer.customer_id}</p></td>
                    <td className="px-5 py-4 text-slate-300">{customer.customer_type === "INDIVIDUAL" ? "Individual" : "Business"}</td>
                    <td className="px-5 py-4"><span className="border border-white/10 bg-white/[0.04] px-2 py-1 text-xs">{customer.status}</span></td>
                    <td className="px-5 py-4 text-slate-400"><p>{customer.email || "—"}</p><p className="mt-1 text-xs">{customer.phone || "—"}</p></td>
                    <td className="px-5 py-4 text-slate-400">{[customer.city, customer.state_region].filter(Boolean).join(", ") || customer.country_code}</td>
                    <td className="px-5 py-4 text-slate-400">{formatDate(customer.updated_at)}</td>
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
