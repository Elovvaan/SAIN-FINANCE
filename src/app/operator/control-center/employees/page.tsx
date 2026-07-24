"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, KeyRound, LockKeyhole, Plus, RefreshCw, ShieldCheck, UserCog, Users } from "lucide-react";

type OperatorUser = {
  userId?: string;
  id?: string;
  email: string;
  displayName?: string | null;
  status?: string;
  roles?: string[];
  permissions?: string[];
  lastLoginAt?: string | null;
};

function userId(user: OperatorUser) {
  return user.userId || user.id || "";
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

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/users", { cache: "no-store" });
      const body = (await response.json()) as { users?: OperatorUser[]; error?: string };
      if (!response.ok) throw new Error(body.error || "EMPLOYEE_LIST_UNAVAILABLE");
      setUsers(body.users || []);
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

  async function updateStatus(target: OperatorUser, status: "ACTIVE" | "SUSPENDED") {
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
        body: JSON.stringify({ targetUserId, status, reason: "CEO_CONTROL_CENTER" }),
      });
      const body = (await response.json()) as { user?: OperatorUser; error?: string };
      if (!response.ok) throw new Error(body.error || "EMPLOYEE_STATUS_UPDATE_FAILED");
      setMessage(`${target.email} is now ${status.toLowerCase()}.`);
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "EMPLOYEE_STATUS_UPDATE_FAILED");
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 bg-black/90">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">S</span>
            <span className="text-sm font-semibold uppercase tracking-[0.28em]">SAIN EMPLOYEE ADMINISTRATION</span>
          </div>
          <Link href="/operator/control-center" className="flex items-center gap-2 text-sm text-slate-300 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            CEO Control Center
          </Link>
        </div>
      </header>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Institution workforce control</p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Employees</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">Create internal operator accounts, review workforce access, and activate or suspend employee entry into SAIN institutional operations.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-10 sm:px-8 lg:grid-cols-[380px_1fr]">
        <aside className="border border-white/10 bg-white/[0.025] p-6">
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
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="border border-white/10 bg-black px-3 py-3 text-white outline-none transition focus:border-emerald-300/50"
                placeholder="Employee name"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Work email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="border border-white/10 bg-black px-3 py-3 text-white outline-none transition focus:border-emerald-300/50"
                placeholder="employee@sain.finance"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Temporary password
              <input
                type="password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                required
                minLength={12}
                className="border border-white/10 bg-black px-3 py-3 text-white outline-none transition focus:border-emerald-300/50"
                placeholder="Minimum 12 characters"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex items-center justify-center gap-2 border border-emerald-300/50 bg-emerald-400/10 px-4 py-3 font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserCog className="h-4 w-4" aria-hidden />
              {submitting ? "Creating account..." : "Create employee"}
            </button>
          </form>

          <div className="mt-6 border border-white/10 p-4 text-sm leading-6 text-slate-400">
            Role and permission assignment remains controlled by the institution role administration service after the employee account is created.
          </div>
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
              <p className="mt-4 text-sm text-slate-400">Controlled accounts</p>
              <p className="mt-2 text-3xl font-semibold">{users.length}</p>
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
              <div className={`border-b px-5 py-4 text-sm ${error ? "border-red-400/20 bg-red-400/[0.06] text-red-200" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100"}`}>
                {error || message}
              </div>
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
                    <article key={userId(user) || user.email} className="grid gap-5 p-5 xl:grid-cols-[1fr_auto] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="truncate text-lg font-semibold">{user.displayName || user.email}</h3>
                          <span className={`border px-2 py-1 text-xs font-semibold ${active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
                            {status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">{user.email}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(user.roles || []).length > 0 ? (user.roles || []).map((role) => (
                            <span key={role} className="border border-white/10 px-2 py-1 text-xs text-slate-300">{role}</span>
                          )) : <span className="text-xs text-slate-500">No role summary returned</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {active ? (
                          <button onClick={() => void updateStatus(user, "SUSPENDED")} className="flex items-center gap-2 border border-amber-400/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/10">
                            <LockKeyhole className="h-4 w-4" aria-hidden />
                            Suspend
                          </button>
                        ) : (
                          <button onClick={() => void updateStatus(user, "ACTIVE")} className="flex items-center gap-2 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-400/10">
                            <ShieldCheck className="h-4 w-4" aria-hidden />
                            Activate
                          </button>
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
