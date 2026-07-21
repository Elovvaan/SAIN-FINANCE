"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/platform/filing-office";
  return value;
}

export default function OperatorLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const body = (await response.json()) as { error?: string };
    setSubmitting(false);
    if (!response.ok) {
      setError(body.error === "INVALID_CREDENTIALS" ? "The email or password is incorrect." : "Operator login is not configured.");
      return;
    }
    router.replace(safeReturnPath(searchParams.get("returnTo")));
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#020504] px-6 py-16 text-white">
      <div className="mx-auto max-w-md border border-white/10 bg-white/[0.03] p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">SAIN Finance</p>
        <h1 className="mt-3 text-3xl font-semibold">Operator sign in</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Institutional operations require an authenticated administrator session.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm">Email<input name="email" type="email" required autoComplete="username" className="mt-2 w-full border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-emerald-300" /></label>
          <label className="block text-sm">Password<input name="password" type="password" required autoComplete="current-password" className="mt-2 w-full border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-emerald-300" /></label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button disabled={submitting} className="w-full bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-60">{submitting ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </main>
  );
}
