"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

type Operator = {
  userId: string;
  email: string;
  displayName?: string;
  roles: string[];
  expiresAt: number;
};

type SessionResponse = {
  operator?: Operator;
  error?: string;
};

export function AuthenticatedWorkspaceGate({
  workspace,
  children,
}: {
  workspace: "worker" | "employer";
  children: ReactNode;
}) {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const identityKey = workspace === "worker" ? "sain-career-email" : "sain-employer-email";

  function activateIdentity(authenticated: Operator) {
    window.localStorage.setItem(identityKey, authenticated.email.trim().toLowerCase());
    setOperator(authenticated);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/platform/auth/session", { cache: "no-store" });
        const body = (await response.json()) as SessionResponse;
        if (!active) return;
        if (response.ok && body.operator) activateIdentity(body.operator);
      } catch {
        if (active) setError("PLATFORM_SESSION_UNAVAILABLE");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [identityKey]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/platform/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as SessionResponse;
      if (!response.ok || !body.operator) throw new Error(body.error || "PLATFORM_LOGIN_FAILED");
      activateIdentity(body.operator);
      setPassword("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "PLATFORM_LOGIN_FAILED");
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/platform/auth/logout", { method: "POST" });
    window.localStorage.removeItem(identityKey);
    setOperator(null);
    setEmail("");
    setPassword("");
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-black text-sm text-slate-300">Loading authenticated workspace…</main>;
  }

  if (!operator) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
        <section className="w-full max-w-md border border-white/10 bg-white/[0.025] p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">SAIN authenticated entity</p>
          <h1 className="mt-4 text-3xl font-semibold">Sign in to your {workspace} workspace</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Your verified account identity determines which persistent records are loaded.</p>
          <form onSubmit={signIn} className="mt-7 grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              Account email
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 border border-white/10 bg-black px-3 text-white" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Password
              <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 border border-white/10 bg-black px-3 text-white" />
            </label>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button disabled={submitting} className="h-11 bg-emerald-400 px-5 font-semibold text-black disabled:opacity-60">
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="bg-black">
      <div className="border-b border-white/10 bg-black px-5 py-2 text-right text-xs text-slate-400 sm:px-8">
        <span>{operator.displayName || operator.email}</span>
        <button type="button" onClick={() => void signOut()} className="ml-4 text-emerald-300 hover:text-emerald-200">Sign out</button>
      </div>
      {children}
    </div>
  );
}
