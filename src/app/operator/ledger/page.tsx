"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, FilePlus2, Landmark, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Account = {
  gl_account_id: string;
  account_number: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  status: string;
  debit_total: string;
  credit_total: string;
};

type Entry = {
  gl_journal_entry_id: string;
  journal_number: string;
  source_module: string;
  source_reference: string | null;
  accounting_date: string;
  status: string;
  description: string;
  debit_total: string;
  credit_total: string;
  line_count: number;
};

type ApiError = { error?: string };
type StatCard = { label: string; value: string | number; Icon: LucideIcon };

function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount) : "—";
}

function readableError(code?: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using the ledger.",
    GL_ACCOUNT_FIELDS_REQUIRED: "Enter an account number and account name.",
    GL_ACCOUNT_TYPE_INVALID: "Choose a valid account type.",
    GL_NORMAL_BALANCE_INVALID: "Choose a valid normal balance.",
    GL_ENTRY_FIELDS_REQUIRED: "Complete the journal header.",
    GL_ENTRY_LINES_REQUIRED: "A journal needs at least two lines.",
    GL_LINE_INVALID: "Each journal line must contain either a debit or a credit.",
    GL_ENTRY_NOT_BALANCED: "Total debits must equal total credits.",
    GL_ACCOUNT_NOT_FOUND: "One or more ledger accounts could not be found.",
    GL_ENTRY_NOT_FOUND: "The journal entry could not be found.",
    GL_ENTRY_NOT_DRAFT: "Only draft entries can be posted or voided.",
    GL_UNAVAILABLE: "The general ledger workspace is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

export default function LedgerPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [selected, setSelected] = useState<Entry | null>(null);

  const load = useCallback(async (search = "") => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/operator/ledger?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const body = await response.json() as { accounts?: Account[]; entries?: Entry[] } & ApiError;
      if (response.status === 401) return window.location.assign("/operator/login");
      if (!response.ok) throw new Error(body.error || "GL_UNAVAILABLE");
      setAccounts(body.accounts || []);
      const rows = body.entries || [];
      setEntries(rows);
      setSelected((current) => current ? rows.find((row) => row.gl_journal_entry_id === current.gl_journal_entry_id) || null : null);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const postedTotal = useMemo(() => entries.filter((entry) => entry.status === "POSTED").reduce((sum, entry) => sum + Number(entry.debit_total || 0), 0), [entries]);
  const stats: StatCard[] = [
    { label: "Ledger accounts", value: accounts.length, Icon: Landmark },
    { label: "Draft journals", value: entries.filter((entry) => entry.status === "DRAFT").length, Icon: FilePlus2 },
    { label: "Posted activity", value: money(postedTotal), Icon: CheckCircle2 },
  ];

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/operator/ledger", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "CREATE_ACCOUNT", ...payload }) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "GL_UNAVAILABLE");
      form.reset(); setShowAccount(false); setNotice("Ledger account created."); await load(query);
    } catch (requestError) { setError(readableError(requestError instanceof Error ? requestError.message : undefined)); }
    finally { setSaving(false); }
  }

  async function submitJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      action: "CREATE_JOURNAL",
      sourceModule: data.get("sourceModule"),
      sourceReference: data.get("sourceReference"),
      accountingDate: data.get("accountingDate"),
      description: data.get("description"),
      lines: [
        { glAccountId: data.get("debitAccountId"), debitAmount: Number(data.get("amount")), description: data.get("description") },
        { glAccountId: data.get("creditAccountId"), creditAmount: Number(data.get("amount")), description: data.get("description") },
      ],
    };
    try {
      const response = await fetch("/api/operator/ledger", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "GL_UNAVAILABLE");
      form.reset(); setShowJournal(false); setNotice("Balanced journal entry created."); await load(query);
    } catch (requestError) { setError(readableError(requestError instanceof Error ? requestError.message : undefined)); }
    finally { setSaving(false); }
  }

  async function journalAction(action: string) {
    if (!selected) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/operator/ledger", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ journalEntryId: selected.gl_journal_entry_id, action }) });
      const body = await response.json() as ApiError;
      if (!response.ok) throw new Error(body.error || "GL_UNAVAILABLE");
      setNotice(action === "POST" ? "Journal posted to the general ledger." : "Draft journal voided."); await load(query);
    } catch (requestError) { setError(readableError(requestError instanceof Error ? requestError.message : undefined)); }
    finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-[#020504] text-slate-100">
      <header className="border-b border-emerald-400/15 bg-black/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div><p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Operator</p><h1 className="text-lg font-semibold text-white">General Ledger</h1></div>
          <nav className="flex gap-4 text-sm"><a href="/operator/servicing" className="text-slate-400 hover:text-white">Servicing</a><a href="/operator/credit" className="text-slate-400 hover:text-white">Credit</a><a href="/operator/loans" className="text-slate-400 hover:text-white">Loans</a></nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 md:grid-cols-3">{stats.map(({ label, value, Icon }) => <div key={label} className="border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-400">{label}</p><Icon className="h-5 w-5 text-emerald-300" /></div><p className="mt-4 text-3xl font-semibold">{value}</p></div>)}</section>

        <section className="mt-6 border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="flex w-full max-w-xl gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts or journals" className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none focus:border-emerald-400/50" /></div><button className="h-11 border border-white/10 px-4 text-sm">Search</button><button type="button" onClick={() => void load(query)} className="flex h-11 w-11 items-center justify-center border border-white/10"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></form>
            <div className="flex gap-2"><button onClick={() => setShowAccount((value) => !value)} className="inline-flex h-11 items-center gap-2 border border-emerald-400/30 px-4 text-sm text-emerald-200"><Plus className="h-4 w-4" />Account</button><button onClick={() => setShowJournal((value) => !value)} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-4 text-sm font-semibold text-black"><BookOpen className="h-4 w-4" />Journal</button></div>
          </div>

          {showAccount && <form onSubmit={submitAccount} className="grid gap-3 border-b border-white/10 p-5 md:grid-cols-5"><input name="accountNumber" required placeholder="Account number" className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /><input name="accountName" required placeholder="Account name" className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /><select name="accountType" className="h-11 border border-white/10 bg-black/60 px-3 text-sm"><option>ASSET</option><option>LIABILITY</option><option>EQUITY</option><option>INCOME</option><option>EXPENSE</option></select><select name="normalBalance" className="h-11 border border-white/10 bg-black/60 px-3 text-sm"><option>DEBIT</option><option>CREDIT</option></select><button disabled={saving} className="h-11 bg-emerald-400 font-semibold text-black">Create account</button></form>}

          {showJournal && <form onSubmit={submitJournal} className="grid gap-3 border-b border-white/10 p-5 md:grid-cols-2 lg:grid-cols-4"><input name="sourceModule" defaultValue="MANUAL" required placeholder="Source module" className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /><input name="sourceReference" placeholder="Source reference" className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /><input name="accountingDate" type="date" required className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /><input name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount" className="h-11 border border-white/10 bg-black/40 px-3 text-sm" /><select name="debitAccountId" required className="h-11 border border-white/10 bg-black/60 px-3 text-sm"><option value="">Debit account</option>{accounts.filter((a) => a.status === "ACTIVE").map((a) => <option key={a.gl_account_id} value={a.gl_account_id}>{a.account_number} — {a.account_name}</option>)}</select><select name="creditAccountId" required className="h-11 border border-white/10 bg-black/60 px-3 text-sm"><option value="">Credit account</option>{accounts.filter((a) => a.status === "ACTIVE").map((a) => <option key={a.gl_account_id} value={a.gl_account_id}>{a.account_number} — {a.account_name}</option>)}</select><input name="description" required placeholder="Journal description" className="h-11 border border-white/10 bg-black/40 px-3 text-sm lg:col-span-1" /><button disabled={saving} className="h-11 bg-emerald-400 font-semibold text-black">Create balanced journal</button></form>}

          {(notice || error) && <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || notice}</div>}

          <div className="grid lg:grid-cols-[0.75fr_1.25fr_0.55fr]">
            <div className="border-r border-white/10"><div className="border-b border-white/10 px-5 py-4 text-xs uppercase tracking-wider text-slate-500">Chart of accounts</div><div className="max-h-[650px] overflow-auto divide-y divide-white/10">{accounts.map((account) => <div key={account.gl_account_id} className="p-4"><p className="font-medium text-white">{account.account_number} · {account.account_name}</p><p className="mt-1 text-xs text-slate-500">{account.account_type} · {account.normal_balance}</p><p className="mt-2 text-sm text-slate-300">Dr {money(account.debit_total)} · Cr {money(account.credit_total)}</p></div>)}</div></div>
            <div className="overflow-x-auto border-r border-white/10"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Journal</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Debits</th><th className="px-5 py-4">Credits</th></tr></thead><tbody className="divide-y divide-white/10">{loading ? <tr><td colSpan={5} className="px-5 py-16 text-center text-slate-400"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />Loading ledger</td></tr> : entries.length === 0 ? <tr><td colSpan={5} className="px-5 py-16 text-center text-slate-500">No journal entries found.</td></tr> : entries.map((entry) => <tr key={entry.gl_journal_entry_id} onClick={() => setSelected(entry)} className={`cursor-pointer hover:bg-white/[0.03] ${selected?.gl_journal_entry_id === entry.gl_journal_entry_id ? "bg-emerald-400/[0.05]" : ""}`}><td className="px-5 py-4"><p className="font-medium text-white">{entry.journal_number}</p><p className="mt-1 text-xs text-slate-500">{entry.description} · {entry.source_module}</p></td><td className="px-5 py-4">{entry.accounting_date}</td><td className="px-5 py-4"><span className="border border-white/10 px-2 py-1 text-xs">{entry.status}</span></td><td className="px-5 py-4">{money(entry.debit_total)}</td><td className="px-5 py-4">{money(entry.credit_total)}</td></tr>)}</tbody></table></div>
            <aside className="p-5">{!selected ? <div className="py-16 text-center text-sm text-slate-500">Select a journal entry.</div> : <div className="space-y-5"><div><p className="text-xs uppercase tracking-wider text-emerald-300">Selected journal</p><h2 className="mt-2 text-lg font-semibold">{selected.journal_number}</h2><p className="mt-1 text-sm text-slate-400">{selected.description}</p></div><div className="border border-white/10 p-4 text-sm"><div className="flex justify-between"><span className="text-slate-500">Debits</span><span>{money(selected.debit_total)}</span></div><div className="mt-2 flex justify-between"><span className="text-slate-500">Credits</span><span>{money(selected.credit_total)}</span></div><div className="mt-2 flex justify-between"><span className="text-slate-500">Lines</span><span>{selected.line_count}</span></div></div>{selected.status === "DRAFT" && <><button disabled={saving} onClick={() => void journalAction("POST")} className="h-10 w-full bg-emerald-400 text-sm font-semibold text-black">Post journal</button><button disabled={saving} onClick={() => void journalAction("VOID")} className="h-10 w-full border border-red-400/30 text-sm text-red-200">Void draft</button></>}</div>}</aside>
          </div>
        </section>
      </div>
    </main>
  );
}
