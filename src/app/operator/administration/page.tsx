"use client";

import { FormEvent, useEffect, useState } from "react";

type Workspace = {
  branches: Array<Record<string, unknown>>;
  roles: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  workflows: Array<Record<string, unknown>>;
  settings: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
};

const emptyWorkspace: Workspace = { branches: [], roles: [], assignments: [], products: [], workflows: [], settings: [], summary: {} };

export default function AdministrationPage() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(q = "") {
    setLoading(true);
    const response = await fetch(`/api/operator/administration?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "ADMINISTRATION_UNAVAILABLE");
    else setWorkspace(data);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const entityType = String(form.get("entityType") || "");
    const body: Record<string, unknown> = { entityType };
    for (const [key, value] of form.entries()) {
      if (key !== "entityType" && String(value).trim()) body[key] = value;
    }
    if (entityType === "ROLE") body.permissions = String(form.get("permissions") || "").split(",").map((value) => value.trim()).filter(Boolean);
    const response = await fetch("/api/operator/administration", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    setMessage(response.ok ? `${entityType} saved.` : data.error || "ADMINISTRATION_UNAVAILABLE");
    if (response.ok) { event.currentTarget.reset(); await load(query); }
  }

  async function changeStatus(itemType: string, itemId: string, action: string) {
    const response = await fetch("/api/operator/administration", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemType, itemId, action }) });
    const data = await response.json();
    setMessage(response.ok ? `${itemType} changed to ${action}.` : data.error || "ADMINISTRATION_UNAVAILABLE");
    if (response.ok) await load(query);
  }

  const summary = workspace.summary || {};
  const card = "rounded-xl border border-slate-800 bg-slate-950 p-4";
  const input = "rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">SAIN Finance</p>
          <h1 className="text-3xl font-semibold">Enterprise Administration</h1>
          <p className="mt-2 text-sm text-slate-400">Institution structure, roles, products, workflows, and enterprise settings.</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Active branches", summary.active_branches], ["Active roles", summary.active_roles], ["Assignments", summary.active_assignments],
            ["Active products", summary.active_products], ["Active workflows", summary.active_workflows],
          ].map(([label,value]) => <div key={String(label)} className={card}><p className="text-xs text-slate-400">{String(label)}</p><p className="mt-2 text-2xl font-semibold">{String(value ?? 0)}</p></div>)}
        </section>

        <section className={card}>
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void load(query); }}>
            <input className={`${input} flex-1`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches, roles, users, products, or workflows" />
            <button className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium">Search</button>
          </form>
          {message && <p className="mt-3 text-sm text-cyan-300">{message}</p>}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <form className={`${card} space-y-3`} onSubmit={submit}>
            <input type="hidden" name="entityType" value="BRANCH" />
            <h2 className="font-semibold">Create branch</h2>
            <input className={`${input} w-full`} name="branchCode" placeholder="Branch code" required />
            <input className={`${input} w-full`} name="branchName" placeholder="Branch name" required />
            <input className={`${input} w-full`} name="timezone" placeholder="America/Denver" />
            <button className="rounded bg-cyan-600 px-4 py-2 text-sm">Create branch</button>
          </form>

          <form className={`${card} space-y-3`} onSubmit={submit}>
            <input type="hidden" name="entityType" value="ROLE" />
            <h2 className="font-semibold">Create role</h2>
            <input className={`${input} w-full`} name="roleCode" placeholder="Role code" required />
            <input className={`${input} w-full`} name="roleName" placeholder="Role name" required />
            <input className={`${input} w-full`} name="permissions" placeholder="permission.one, permission.two" />
            <input className={`${input} w-full`} name="approvalLimit" type="number" min="0" step="0.01" placeholder="Approval limit" />
            <button className="rounded bg-cyan-600 px-4 py-2 text-sm">Create role</button>
          </form>

          <form className={`${card} space-y-3`} onSubmit={submit}>
            <input type="hidden" name="entityType" value="PRODUCT" />
            <h2 className="font-semibold">Create loan product</h2>
            <input className={`${input} w-full`} name="productCode" placeholder="Product code" required />
            <input className={`${input} w-full`} name="productName" placeholder="Product name" required />
            <div className="grid grid-cols-2 gap-2">
              <input className={input} name="minAmount" type="number" min="0" step="0.01" placeholder="Min amount" />
              <input className={input} name="maxAmount" type="number" min="0" step="0.01" placeholder="Max amount" />
              <input className={input} name="minRate" type="number" min="0" step="0.000001" placeholder="Min rate" />
              <input className={input} name="maxRate" type="number" min="0" step="0.000001" placeholder="Max rate" />
            </div>
            <button className="rounded bg-cyan-600 px-4 py-2 text-sm">Create product</button>
          </form>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <DataTable title="Branches" rows={workspace.branches} columns={["branch_code","branch_name","status","timezone"]} onStatus={(row,status) => changeStatus("BRANCH",String(row.branch_id),status)} actions={["ACTIVE","INACTIVE","CLOSED"]} />
          <DataTable title="Roles" rows={workspace.roles} columns={["role_code","role_name","status","approval_limit"]} onStatus={(row,status) => changeStatus("ROLE",String(row.role_id),status)} actions={["ACTIVE","INACTIVE"]} />
          <DataTable title="Loan products" rows={workspace.products} columns={["product_code","product_name","status","min_amount","max_amount"]} onStatus={(row,status) => changeStatus("PRODUCT",String(row.loan_product_id),status)} actions={["ACTIVE","INACTIVE","RETIRED"]} />
          <DataTable title="Workflows" rows={workspace.workflows} columns={["workflow_code","workflow_name","module","status","version"]} onStatus={(row,status) => changeStatus("WORKFLOW",String(row.workflow_id),status)} actions={["ACTIVE","INACTIVE","RETIRED"]} />
        </section>

        <section className={card}>
          <h2 className="mb-3 font-semibold">User role assignments</h2>
          <DataTable title="" rows={workspace.assignments} columns={["user_id","role_name","branch_name","status","effective_from"]} />
        </section>

        {loading && <p className="text-sm text-slate-400">Loading administration workspace…</p>}
      </div>
    </main>
  );
}

function DataTable({ title, rows, columns, actions, onStatus }: { title: string; rows: Array<Record<string,unknown>>; columns: string[]; actions?: string[]; onStatus?: (row: Record<string,unknown>, status: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      {title && <h2 className="border-b border-slate-800 px-4 py-3 font-semibold">{title}</h2>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase text-slate-400"><tr>{columns.map((column) => <th className="px-3 py-2" key={column}>{column.replaceAll("_"," ")}</th>)}{actions && <th className="px-3 py-2">Actions</th>}</tr></thead>
          <tbody>{rows.map((row,index) => <tr className="border-t border-slate-800" key={String(Object.values(row)[0] ?? index)}>{columns.map((column) => <td className="px-3 py-2" key={column}>{formatValue(row[column])}</td>)}{actions && <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{actions.map((action) => <button className="rounded border border-slate-700 px-2 py-1 text-xs hover:border-cyan-500" key={action} onClick={() => onStatus?.(row,action)}>{action}</button>)}</div></td>}</tr>)}</tbody>
        </table>
        {!rows.length && <p className="p-4 text-sm text-slate-500">No records.</p>}
      </div>
    </div>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}