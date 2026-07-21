"use client";

import { FormEvent, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type ActivationField =
  | {
      label: string;
      type: "text" | "email" | "password" | "number";
      helper?: string;
      required?: boolean;
    }
  | {
      label: string;
      type: "select";
      options: string[];
      helper?: string;
      required?: boolean;
    };

type ActivationPageProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  workspace: string;
  steps: string[];
  fields: ActivationField[];
  submitLabel: string;
  confirmationTitle: string;
  confirmationCopy: string;
  readinessItems: string[];
  children?: ReactNode;
};

export function ActivationPage({
  eyebrow,
  title,
  subtitle,
  workspace,
  steps,
  fields,
  submitLabel,
  confirmationTitle,
  confirmationCopy,
  readinessItems,
  children,
}: ActivationPageProps) {
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 bg-black/[0.84] backdrop-blur-xl">
        <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">
              S
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.28em] text-white">
              SAIN
            </span>
          </Link>
          <div className="hidden items-center gap-5 text-sm font-semibold text-slate-400 sm:flex">
            <Link href="/platform/employment" className="transition hover:text-emerald-200">
              Employment Sandbox
            </Link>
            <Link href="/platform/partners" className="transition hover:text-emerald-200">
              Partner Center
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative overflow-hidden border-b border-white/10 py-16 sm:py-24">
        <div className="absolute left-1/2 top-10 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr]">
          <div className="relative">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-emerald-200"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Platform Gateway
            </Link>
            <p className="mt-12 inline-flex border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
              {eyebrow}
            </p>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-7xl">
              {title}
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
              {subtitle}
            </p>
            <div className="mt-10 border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
              <div className="flex items-center gap-3">
                <LockKeyhole className="h-5 w-5 text-emerald-300" aria-hidden />
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Sandbox activation only
                </p>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                This flow models account activation and workspace routing. It
                does not create a live account, submit real credentials, move
                money, or connect to any external system.
              </p>
            </div>
          </div>

          <div className="relative border border-white/10 bg-white/[0.025] p-5 sm:p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                  Activation
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {workspace}
                </h2>
              </div>
              <Sparkles className="h-6 w-6 text-emerald-300" aria-hidden />
            </div>

            {submitted ? (
              <div className="border border-emerald-400/30 bg-emerald-400/[0.08] p-6">
                <CheckCircle2 className="h-10 w-10 text-emerald-300" aria-hidden />
                <h3 className="mt-6 text-2xl font-semibold text-white">
                  {confirmationTitle}
                </h3>
                <p className="mt-4 leading-7 text-slate-300">{confirmationCopy}</p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="mt-7 inline-flex h-11 items-center border border-white/15 px-5 text-sm font-semibold text-white transition hover:border-emerald-300/60 hover:text-emerald-200"
                >
                  Review activation details
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="grid gap-4">
                {fields.map((field) => (
                  <label key={field.label} className="grid gap-2 text-sm text-slate-300">
                    {field.label}
                    {field.type === "select" ? (
                      <select
                        required={field.required !== false}
                        className="h-12 border border-white/[0.12] bg-[#080b0a] px-4 text-white outline-none transition focus:border-emerald-300/70"
                      >
                        {field.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        required={field.required !== false}
                        type={field.type}
                        className="h-12 border border-white/[0.12] bg-white/[0.035] px-4 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300/70"
                      />
                    )}
                    {field.helper && (
                      <span className="text-xs leading-5 text-slate-500">{field.helper}</span>
                    )}
                  </label>
                ))}
                <button
                  type="submit"
                  className="mt-3 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
                >
                  {submitLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[.95fr_1.05fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
              Account Path
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              One SAIN Account unlocks the right workspace.
            </h2>
            <p className="mt-6 leading-8 text-slate-400">
              Users may eventually belong to multiple workspaces. This mock
              activation flow shows how SAIN can route a worker, employer,
              staffing agency, partner, or admin from one account model into
              the correct operating surface.
            </p>
          </div>
          <div className="grid gap-4">
            {steps.map((step, index) => (
              <div
                key={step}
                className="flex items-center gap-4 border border-white/10 bg-white/[0.025] p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-emerald-400/25 bg-emerald-400/10 font-mono text-xs font-semibold text-emerald-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="font-semibold text-white">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-7xl px-5 sm:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {readinessItems.map((item) => (
              <div key={item} className="border border-white/10 bg-white/[0.025] p-5">
                <BadgeCheck className="h-5 w-5 text-emerald-300" aria-hidden />
                <p className="mt-4 text-sm leading-6 text-slate-300">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-sm font-semibold text-white transition hover:border-emerald-300/60 hover:text-emerald-200"
            >
              Return to Platform Gateway
            </Link>
            <Link
              href="/platform/employment"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
            >
              View Employment Sandbox
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      {children}
    </main>
  );
}
