"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldMinus,
  UserCog,
  Users,
} from "lucide-react";

type RoleAssignment = {
  userRoleId: string;
  roleCode: string;
  status: string;
  effectiveAt: string;
  expiresAt?: string;
};

type OperatorUser = {
  userId?: string;
  id?: string;
  email: string;
  displayName?: string | null;
  status?: string;
  roles?: string[];
  permissions?: string[];
  roleAssignments?: RoleAssignment[];
  lastLoginAt?: string | null;
  createdAt?: string;
};

const ROLE_OPTIONS = [
  "INSTITUTION_ADMIN",
  "LOAN_OFFICER",
  "COMPLIANCE_OFFICER",
  "ACCOUNTING",
  "TREASURY",
  "COLLECTIONS",
  "CUSTOMER_SERVICE",
  "DOCUMENT_SPECIALIST",
  "AUDITOR",
  "IT_ADMIN",
];

function userId(user: OperatorUser) {
  return user.userId || user.id || "";
}

function displayDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function EmployeeAdministrationPage() {
  const [users, setUsers] = useState<OperatorUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [selectedUser, setSelectedUser] = useState<OperatorUser | null>(null);
  const [roleCode, setRoleCode] = useState(ROLE_OPTIONS[1]);
  const [expiresAt, setExpiresAt] = useState("");
  const [roleBusy, setRoleBusy] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/users", { cache: "no-store" });
      const body = (await response.json()) as { users?: OperatorUser[]; error?: string };
      if (!response.ok) throw new Error(body.error || "EMPLOYEE_LIST_UNAVAILABLE");
      const nextUsers = body.users || [];
      setUsers(nextUsers);
      if (selectedUser) {
        setSelectedUser(nextUsers.find((user) => userId(user) === userId(selectedUser)) || null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "EMPLOYEE_LIST_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const activeCount = useMemo(
    () => users.filter((user) => (user.status || "ACTIVE").toUpperCase() === "ACTIVE").length,
    [users],
  );

  const assignedCount = useMemo(
    () => users.filter((user) => (user.roles || []).length > 0).length,
    [users],
  );

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName, temporaryPassword }),
      });
      const body = (await response.json()) as { user?: OperatorUser; error?: string };
      if (!response.ok) throw new Error(body.error || "EMPLOYEE_CREATE_FAILED");
      setEmail("");
      setDisplayName("");
      setTemporaryPassword("");
      setMessage("Employee account created.");
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "EMPLOYEE_CREATE_FAILED");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(target: OperatorUser, status: "ACTIVE" | "SUSPENDED" | "DISABLED") {
    const targetUserId = userId(target);
    if (!targetUserId) {
      setError("EMPLOYEE_IDENTIFIER_MISSING");
      return;
    }
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUserId, status, reason: "CEO_EMPLOYEE_MANAGEMENT" }),
      });
      const body = (await response.json()) as { user?: OperatorUser; error?: string };
      if (!response.ok) throw new Error(body.error || "EMPLOYEE_STATUS_UPDATE_FAILED");
      setMessage(`${target.email} is now ${status.toLowerCase()}.`);
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "EMPLOYEE_STATUS_UPDATE_FAILED");
    }
  }

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;
    setRoleBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: userId(selectedUser),
          roleCode,
          expiresAt: expiresAt || undefined,
        }),
      });
      const body = (await response.json()) as { result?: RoleAssignment; error?: string };
      if (!response.ok) throw new Error(body.error || "ROLE_ASSIGNMENT_FAILED");
      setMessage(`${roleCode} assigned to ${selectedUser.email}.`);
      setExpiresAt("");
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ROLE_ASSIGNMENT_FAILED");
    } finally {
      setRoleBusy(false);
    }
  }

  async function revokeRole(target: OperatorUser, assignment: RoleAssignment) {
    const reason = window.prompt(`Reason for revoking ${assignment.roleCode} from ${target.email}:`);
    if (!reason?.trim()) return;
    setRoleBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/roles", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userRoleId: assignment.userRoleId, reason }),
      });
      const body = (await response.json()) as { result?: { status: string }; error?: string };
      if (!response.ok) throw new Error(body.error || "ROLE_REVOCATION_FAILED");
      setMessage(`${assignment.roleCode} revoked from ${target.email}.`);
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ROLE_REVOCATION_FAILED");
    } finally {
      setRoleBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 bg-black/90">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">S</span>
            <span className="text-sm font-semibold uppercase tracking-[0.28em]">SAIN EMPLOYEE MANAGEMENT</span>
          </div>
          <Link href="/operator/control-center" className="flex items-center gap-2 text-sm text-slate-300 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            CEO Control Center
          </Link>
        </div>
      </header>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Institution workforce authority</p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Employee Management</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">Create internal accounts, assign roles, inspect permissions, manage account status, and revoke access from one controlled institution workspace.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-10 sm:px-8 lg:grid-cols-[380px_1fr]">
        <aside className="grid content-start gap-6">
          <div className="border border-white/10 bg-white/[0.025] p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center border border-emerald-400/30 bg-emerald-400/10">
                <Plus className="h-5 w-5 text-emerald-300" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">New internal account</p>
                <h2 className="mt-1 text-xl font-semibold">Add employee</h2>
              </div>
            </div>

            <form onSubmit={createEmployee} className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm text-slate-300">
                Display name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="border border-white/10 bg-black px-3 py-3 text-white outline-none transition focus:border-emerald-300/50" placeholder="Employee name" />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Work email
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="border border-white/10 bg-black px-3 py-3 text-white outline-none transition focus:border-emerald-300/50" placeholder="employee@sain.finance" />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Temporary password
                <input type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} required minLength={12} className="border border-white/10 bg-black px-3 py-3 text-white outline-none transition focus:border-emerald-300/50" placeholder="12+ chars, upper, lower, number" />
              </label>
              <button type="submit" disabled={submitting} className="mt-2 flex items-center justify-center gap-2 border border-emerald-300/50 bg-emerald-400/10 px-4 py-3 font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50">
                <UserCog className="h-4 w-4" aria-hidden />
                {submitting ? "Creating account..." : "Create employee"}
              </button>
            </form>
          </div>

          {selectedUser && (
            <div className="border border-white/10 bg-white/[0.025] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Selected employee</p>
              <h2 className="mt-2 text-xl font-semibold">{selectedUser.displayName || selectedUser.email}</h2>
              <p className="mt-1 text-sm text-slate-400">{selectedUser.email}</p>

              <form onSubmit={assignRole} className="mt-6 grid gap-4">
                <label className="grid gap-2 text-sm text-slate-300">
                  Assign role
                  <select value={roleCode} onChange={(event) => setRoleCode(event.target.value)} className="border border-white/10 bg-black px-3 py-3 text-white outline-none focus:border-emerald-300/50">
                    {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Role expiration
                  <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="border border-white/10 bg-black px-3 py-3 text-white outline-none focus:border-emerald-300/50" />
                </label>
                <button type="submit" disabled={roleBusy} className="flex items-center justify-center gap-2 border border-emerald-300/50 bg-emerald-400/10 px-4 py-3 font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50">
                  <BadgeCheck className="h-4 w-4" aria-hidden />
                  Assign role
                </button>
              </form>
            </div>
          )}
        </aside>

        <section className="min-w-0">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border border-white/10 bg-white/[0.025] p-5">
              <Users className="h-5 w-5 text-emerald-300" aria-hidden />
              <p className="mt-4 text-sm text-slate-400">Total employees</p>
              <p className="mt-2 text-3xl font-semibold">{users.length}</p>
            </div>
            <div className="border border-white/10 bg-white/[0.025] p-5">
              <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden />
              <p className="mt-4 text-sm text-slate-400">Active access</p>
              <p className="mt-2 text-3xl font-semibold">{activeCount}</p>
            </div>
            <div className="border border-white/10 bg-white/[0.025] p-5">
              <KeyRound className="h-5 w-5 text-emerald-300" aria-hidden />
              <p className="mt-4 text-sm text-slate-400">Role assigned</p>
              <p className="mt-2 text-3xl font-semibold">{assignedCount}</p>
            </div>
          </div>

          <div className="mt-6 border border-white/10 bg-white/[0.02]">
            <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Internal directory</p>
                <h2 className="mt-2 text-2xl font-semibold">Institution employees</h2>
              </div>
              <button onClick={() => void loadUsers()} className="flex items-center gap-2 border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-emerald-300/40 hover:text-white">
                <RefreshCw className="h-4 w-4" aria-hidden />
                Refresh
              </button>
            </div>

            {(error || message) && (
              <div className={`border-b px-5 py-4 text-sm ${error ? "border-red-400/20 bg-red-400/[0.06] text-red-200" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100"}`}>{error || message}</div>
            )}

            {loading ? (
              <div className="p-8 text-slate-400">Loading employee directory...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-slate-400">No employee accounts were returned.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {users.map((user) => {
                  const status = (user.status || "ACTIVE").toUpperCase();
                  const active = status === "ACTIVE";
                  return (
                    <article key={userId(user) || user.email} className="grid gap-5 p-5 xl:grid-cols-[1fr_auto] xl:items-start">
                      <button type="button" onClick={() => setSelectedUser(user)} className="min-w-0 text-left">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="truncate text-lg font-semibold">{user.displayName || user.email}</h3>
                          <span className={`border px-2 py-1 text-xs font-semibold ${active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>{status}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">{user.email}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(user.roles || []).length > 0 ? (user.roles || []).map((role) => <span key={role} className="border border-white/10 px-2 py-1 text-xs text-slate-300">{role}</span>) : <span className="text-xs text-slate-500">No active role assigned</span>}
                        </div>
                        <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                          <span className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" aria-hidden /> Last login: {displayDate(user.lastLoginAt)}</span>
                          <span className="flex items-center gap-2"><KeyRound className="h-3.5 w-3.5" aria-hidden /> Permissions: {(user.permissions || []).length}</span>
                        </div>
                        {(user.permissions || []).length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(user.permissions || []).slice(0, 6).map((permission) => <span key={permission} className="border border-emerald-400/20 bg-emerald-400/[0.05] px-2 py-1 text-[11px] text-emerald-100">{permission}</span>)}
                            {(user.permissions || []).length > 6 && <span className="px-2 py-1 text-[11px] text-slate-500">+{(user.permissions || []).length - 6} more</span>}
                          </div>
                        )}
                        {(user.roleAssignments || []).length > 0 && (
                          <div className="mt-4 grid gap-2">
                            {(user.roleAssignments || []).filter((assignment) => assignment.status === "ACTIVE").map((assignment) => (
                              <div key={assignment.userRoleId} className="flex flex-wrap items-center justify-between gap-3 border border-white/10 p-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-200">{assignment.roleCode}</p>
                                  <p className="mt-1 text-xs text-slate-500">Effective {displayDate(assignment.effectiveAt)}{assignment.expiresAt ? ` · Expires ${displayDate(assignment.expiresAt)}` : ""}</p>
                                </div>
                                <button type="button" disabled={roleBusy} onClick={(event) => { event.stopPropagation(); void revokeRole(user, assignment); }} className="flex items-center gap-2 border border-red-400/30 px-3 py-2 text-xs text-red-200 hover:bg-red-400/10 disabled:opacity-50">
                                  <ShieldMinus className="h-3.5 w-3.5" aria-hidden />
                                  Revoke
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {active ? (
                          <>
                            <button onClick={() => void updateStatus(user, "SUSPENDED")} className="flex items-center gap-2 border border-amber-400/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/10"><LockKeyhole className="h-4 w-4" aria-hidden />Suspend</button>
                            <button onClick={() => void updateStatus(user, "DISABLED")} className="flex items-center gap-2 border border-red-400/30 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10"><ShieldMinus className="h-4 w-4" aria-hidden />Disable</button>
                          </>
                        ) : (
                          <button onClick={() => void updateStatus(user, "ACTIVE")} className="flex items-center gap-2 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-400/10"><ShieldCheck className="h-4 w-4" aria-hidden />Activate</button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
