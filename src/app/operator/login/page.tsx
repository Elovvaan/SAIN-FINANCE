"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/operator/operations";
  return value;
}

function currentReturnPath() {
  if (typeof window === "undefined") return "/operator/operations";
  return safeReturnPath(new URLSearchParams(window.location.search).get("returnTo"));
}

type LoginResponse = {
  error?: string;
  authenticated?: boolean;
  mfaRequired?: boolean;
  challengeToken?: string;
  challengeExpiresAt?: number;
};

function loginError(code?: string) {
  if (code === "INVALID_CREDENTIALS") return "The email or password is incorrect.";
  if (code === "MFA_CODE_INVALID" || code === "MFA_CODE_INVALID_FORMAT") return "The authentication code is incorrect.";
  if (code === "MFA_CHALLENGE_EXPIRED" || code === "MFA_CHALLENGE_INVALID") return "The authentication challenge expired. Sign in again.";
  if (code === "MFA_METHOD_LOCKED") return "Multifactor authentication is temporarily locked after repeated failed attempts.";
  if (code === "MFA_LOGIN_BLOCKED") return "This account cannot complete sign in.";
  return "Operator login is temporarily unavailable.";
}

export default function OperatorLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeExpiresAt, setChallengeExpiresAt] = useState<number | null>(null);

  function finishLogin() {
    router.replace(currentReturnPath());
    router.refresh();
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body = (await response.json()) as LoginResponse;

      if (response.status === 202 && body.mfaRequired && body.challengeToken) {
        setChallengeToken(body.challengeToken);
        setChallengeExpiresAt(body.challengeExpiresAt ?? null);
        return;
      }
      if (!response.ok) {
        setError(loginError(body.error));
        return;
      }
      finishLogin();
    } catch {
      setError("Operator login is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/mfa/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeToken, code: form.get("code") }),
      });
      const body = (await response.json()) as LoginResponse;
      if (!response.ok) {
        setError(loginError(body.error));
        if (body.error === "MFA_CHALLENGE_EXPIRED" || body.error === "MFA_CHALLENGE_INVALID") {
          setChallengeToken("");
          setChallengeExpiresAt(null);
        }
        return;
      }
      finishLogin();
    } catch {
      setError("Operator login is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020504] px-6 py-16 text-white">
      <div className="mx-auto max-w-md border border-white/10 bg-white/[0.03] p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">SAIN Finance</p>
        <h1 className="mt-3 text-3xl font-semibold">{challengeToken ? "Verify your identity" : "Operator sign in"}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {challengeToken
            ? "Enter the six-digit code from your authenticator application to complete sign in."
            : "Institutional operations require an authenticated operator session."}
        </p>

        {challengeToken ? (
          <form onSubmit={submitMfa} className="mt-8 space-y-5">
            <label className="block text-sm">
              Authentication code
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                autoComplete="one-time-code"
                autoFocus
                className="mt-2 w-full border border-white/15 bg-black/30 px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none focus:border-emerald-300"
              />
            </label>
            {challengeExpiresAt ? (
              <p className="text-xs text-slate-500">This one-time challenge expires in five minutes.</p>
            ) : null}
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <button disabled={submitting} className="w-full bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-60">
              {submitting ? "Verifying…" : "Verify and sign in"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setChallengeToken("");
                setChallengeExpiresAt(null);
                setError("");
              }}
              className="w-full border border-white/15 px-5 py-3 text-sm text-slate-300 disabled:opacity-60"
            >
              Start over
            </button>
          </form>
        ) : (
          <form onSubmit={submitCredentials} className="mt-8 space-y-5">
            <label className="block text-sm">
              Email
              <input name="email" type="email" required autoComplete="username" className="mt-2 w-full border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-emerald-300" />
            </label>
            <label className="block text-sm">
              Password
              <input name="password" type="password" required autoComplete="current-password" className="mt-2 w-full border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-emerald-300" />
            </label>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <button disabled={submitting} className="w-full bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-60">
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
