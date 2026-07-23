"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Car, CircleDollarSign, Loader2, Package, Plus, RefreshCw, Search } from "lucide-react";

type Customer = { customer_id: string; display_name: string; customer_type: string; status: string };
type Collateral = {
  collateral_id: string;
  customer_id: string;
  customer_name: string | null;
  asset_type: string;
  title: string;
  description: string;
  identifier: string | null;
  valuation: string | number;
  currency_code: string;
  ownership_status: string;
  repository_status: string;
  city: string | null;
  state_region: string | null;
  county: string | null;
  updated_at: string;
};
type ApiError = { error?: string };

function money(value: string | number, currency = "USD") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function errorText(code?: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using collateral.",
    COLLATERAL_CUSTOMER_REQUIRED: "Choose the customer who owns or pledges this asset.",
    COLLATERAL_ASSET_TYPE_INVALID: "Choose a valid collateral type.",
    COLLATERAL_TITLE_REQUIRED: "Enter an asset title.",
    COLLATERAL_VALUATION_INVALID: "Enter a valuation greater than zero.",
    CUSTOMER_NOT_FOUND: "The selected customer was not found.",
    COLLATERAL_REPOSITORY_UNAVAILABLE: "The collateral repository is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

export default function OperatorCollateralPage() {
  const [items, setItems] = useState<Collateral[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/collateral?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const body = await response.json() as { collateral?: Collateral[]; customers?: Customer[] } & ApiError;
      if (response.status === 401) return window.location.assign("/operator/login");
      if (!response.ok) throw new Error(body.error || "COLLATERAL_REPOSITORY_UNAVAILABLE");
      setItems(body.collateral || []);
      setCustomers(body.customers || []);
    } catch (requestError) {
      setError(errorText(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => ({
    count: items.length,
    value: items.reduce((sum, item) => sum + Number(item.valuation || 0), 0),
    realEstate: items.filter((item) => item.asset_type === "REAL_ESTATE").length,
  }), [items]);

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/operator/collateral", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as ApiError;
      if (response.status === 401) return window.location.assign("/operator/login");
      if (!response.ok) throw new Error(body.error || "COLLATERAL_REPOSITORY_UNAVAILABLE");
      form.reset();
      setShowCreate(false);
      setNotice("Collateral record created and lifecycle event recorded.");
      await load(query);
    } catch (requestError) {
      setError(errorText(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020504] text-slate-100">
      <header className="border-b border-emerald-400/15 bg-black/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 font-semibold text-emerald-300">S</div><div><p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Operator</p><h1 className="text-lg font-semibold text-white">Collateral Repository</h1></div></div>
          <div className="flex gap-4 text-sm"><a href="/operator/customers" className="text-slate-400 hover:text-white">Customers</a><a href="/operator/documents" className="text-slate-400 hover:text-white">Documents</a></div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          {[["Collateral records", String(totals.count), Package], ["Recorded value", money(totals.value), CircleDollarSign], ["Real estate", String(totals.realEstate), Building2]].map(([label, value, Icon]) => (
            <div key={String(label)} className="border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-400">{String(label)}</p><Icon className="h-5 w-5 text-emerald-300" /></div><p className="mt-4 text-3xl font-semibold text-white">{String(value)}</p></div>
          ))}
        </section>

        <section className="mt-6 border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="flex w-full max-w-xl gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search asset, identifier, customer, or county" className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none focus:border-emerald-400/50" /></div><button className="h-11 border border-white/10 px-4 text-sm">Search</button><button type="button" onClick={() => void load(query)} className="flex h-11 w-11 items-center justify-center border border-white/10"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></form>
            <button onClick={() => setShowCreate((value) => !value)} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black"><Plus className={`h-4 w-4 ${showCreate ? "rotate-45" : ""}`} />{showCreate ? "Close" : "Add collateral"}</button>
          </div>

          {showCreate && <form onSubmit={createAsset} className="grid gap-4 border-b border-emerald-400/15 bg-emerald-400/[0.035] p-5 md:grid-cols-2">
            <label className="text-sm text-slate-300 md:col-span-2">Customer<select name="customerId" required className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="">Select customer</option>{customers.map((customer) => <option key={customer.customer_id} value={customer.customer_id}>{customer.display_name} · {customer.customer_type}</option>)}</select></label>
            <label className="text-sm text-slate-300">Asset type<select name="assetType" required className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="REAL_ESTATE">Real estate</option><option value="VEHICLE">Vehicle</option><option value="EQUIPMENT">Equipment</option><option value="SECURITIES">Securities</option><option value="PRECIOUS_METALS">Precious metals</option><option value="INTELLECTUAL_PROPERTY">Intellectual property</option><option value="OTHER">Other</option></select></label>
            <label className="text-sm text-slate-300">Status<select name="repositoryStatus" defaultValue="PENDING" className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="PENDING">Pending</option><option value="ACTIVE">Active</option><option value="RELEASED">Released</option><option value="LIQUIDATED">Liquidated</option></select></label>
            <label className="text-sm text-slate-300 md:col-span-2">Asset title<input name="title" required placeholder="Property, vehicle, equipment, or asset name" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
            <label className="text-sm text-slate-300">Identifier<input name="identifier" placeholder="APN, VIN, serial number, account reference" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
            <label className="text-sm text-slate-300">Valuation<input name="valuation" type="number" min="0.01" step="0.01" required className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
            <label className="text-sm text-slate-300">Ownership<select name="ownershipStatus" defaultValue="UNVERIFIED" className="mt-2 h-11 w-full border border-white/10 bg-black/60 px-3"><option value="UNVERIFIED">Unverified</option><option value="OWNED">Owned</option><option value="JOINTLY_OWNED">Jointly owned</option><option value="LEASED">Leased</option><option value="THIRD_PARTY">Third party</option></select></label>
            <label className="text-sm text-slate-300">Currency<input name="currencyCode" defaultValue="USD" maxLength={3} className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3 uppercase" /></label>
            <label className="text-sm text-slate-300 md:col-span-2">Description<textarea name="description" rows={3} className="mt-2 w-full border border-white/10 bg-black/40 px-3 py-2" /></label>
            <label className="text-sm text-slate-300">Address<input name="addressLine1" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label><label className="text-sm text-slate-300">County<input name="county" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label><label className="text-sm text-slate-300">City<input name="city" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label><label className="text-sm text-slate-300">State or region<input name="stateRegion" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label><label className="text-sm text-slate-300">Postal code<input name="postalCode" className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3" /></label>
            <div className="md:col-span-2 flex justify-end"><button disabled={saving} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Creating" : "Create collateral"}</button></div>
          </form>}

          {(notice || error) && <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || notice}</div>}

          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Asset</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Value</th><th className="px-5 py-4">Ownership</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Updated</th></tr></thead><tbody className="divide-y divide-white/10">{loading ? <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-400"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-300" />Loading collateral</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-500">No collateral found.</td></tr> : items.map((item) => <tr key={item.collateral_id} className="hover:bg-white/[0.025]"><td className="px-5 py-4"><div className="flex gap-3">{item.asset_type === "VEHICLE" ? <Car className="h-5 w-5 text-emerald-300" /> : <Package className="h-5 w-5 text-emerald-300" />}<div><p className="font-medium text-white">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.identifier || [item.city, item.state_region].filter(Boolean).join(", ") || item.collateral_id}</p></div></div></td><td className="px-5 py-4 text-slate-300">{item.customer_name || item.customer_id}</td><td className="px-5 py-4 text-slate-400">{item.asset_type.replaceAll("_", " ")}</td><td className="px-5 py-4 font-medium text-white">{money(item.valuation, item.currency_code)}</td><td className="px-5 py-4 text-slate-400">{item.ownership_status.replaceAll("_", " ")}</td><td className="px-5 py-4"><span className="border border-white/10 bg-white/[0.04] px-2 py-1 text-xs">{item.repository_status}</span></td><td className="px-5 py-4 text-slate-400">{dateTime(item.updated_at)}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </main>
  );
}
