import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BookOpenCheck,
  Building2,
  Database,
  FileText,
  Landmark,
  LockKeyhole,
  Network,
  PackageCheck,
  Scale,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { requireOperatorPage } from "@/server/auth/require-operator-page";

export const metadata: Metadata = {
  title: "CEO Control Center | SAIN Finance",
  description: "Executive institution control center for SAIN Finance.",
};

const institutionAreas = [
  {
    label: "Employees",
    description: "Create, assign, suspend, and review internal operator access.",
    href: "/operator/control-center/employees",
    icon: Users,
  },
  {
    label: "Customers",
    description: "Review customer relationships, status, and servicing activity.",
    href: "/operator/operations?view=intake",
    icon: Building2,
  },
  {
    label: "Loans",
    description: "Track applications, underwriting, approvals, funding, and servicing.",
    href: "/operator/operations?view=admin",
    icon: BadgeDollarSign,
  },
  {
    label: "Documents",
    description: "Access the institutional repository and controlled records.",
    href: "/operator/documents",
    icon: FileText,
  },
  {
    label: "Assets",
    description: "Manage institutional assets, collateral, and settlement readiness.",
    href: "/operator/operations?view=assets",
    icon: PackageCheck,
  },
  {
    label: "Instruments",
    description: "Review issued, held, pledged, transferred, and retired instruments.",
    href: "/operator/operations?view=ledger",
    icon: WalletCards,
  },
  {
    label: "Agreements",
    description: "Control institutional agreements, authority records, and obligations.",
    href: "/operator/documents",
    icon: BookOpenCheck,
  },
  {
    label: "Ledger",
    description: "Inspect journals, postings, reversals, balances, and audit lineage.",
    href: "/operator/operations?view=ledger",
    icon: Database,
  },
  {
    label: "Settlement",
    description: "Review payment execution, settlement queues, and reconciliation.",
    href: "/operator/operations?view=treasury",
    icon: Landmark,
  },
  {
    label: "Security",
    description: "Review access controls, sessions, restrictions, and security posture.",
    href: "/operator/operations?view=admin",
    icon: ShieldCheck,
  },
  {
    label: "Compliance",
    description: "Review institutional controls, exceptions, and compliance activity.",
    href: "/operator/operations?view=admin",
    icon: Scale,
  },
  {
    label: "Audit",
    description: "Trace operator actions, record history, approvals, and control events.",
    href: "/operator/operations?view=kernel",
    icon: Activity,
  },
] as const;

const executiveSignals = [
  {
    label: "Pending approvals",
    value: "Review queue",
    detail: "Open internal approvals and exception items.",
    href: "/operator/operations?view=admin",
    icon: BookOpenCheck,
  },
  {
    label: "System health",
    value: "Operational",
    detail: "Review kernel, ledger, treasury, and repository controls.",
    href: "/operator/operations?view=kernel",
    icon: Network,
  },
  {
    label: "Security alerts",
    value: "Review activity",
    detail: "Inspect access, restrictions, login events, and operator status.",
    href: "/operator/operations?view=admin",
    icon: AlertTriangle,
  },
] as const;

export default async function CeoControlCenterPage() {
  const session = await requireOperatorPage("/operator/control-center");

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/operator/control-center" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">
              S
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.28em]">SAIN CEO CONTROL CENTER</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <LockKeyhole className="h-4 w-4 text-emerald-300" aria-hidden />
            <span>{session.email}</span>
            <Link
              href="/operator/operations"
              className="border border-white/10 px-3 py-2 text-slate-300 transition hover:border-emerald-300/50 hover:text-white"
            >
              Internal operations
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Executive institution workspace</p>
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-semibold sm:text-6xl">CEO Control Center</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
                One authenticated institution view across workforce, customers, lending, documents, assets, instruments, ledger, settlement, compliance, security, and audit.
              </p>
            </div>
            <div className="border border-emerald-400/20 bg-emerald-400/[0.06] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Signed in as</p>
              <p className="mt-2 font-semibold">{session.displayName || "Institution Administrator"}</p>
              <p className="mt-1 text-sm text-slate-400">{session.roles.join(", ")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {executiveSignals.map((signal) => {
            const Icon = signal.icon;
            return (
              <Link
                key={signal.label}
                href={signal.href}
                className="group border border-white/10 bg-white/[0.025] p-5 transition hover:border-emerald-300/40 hover:bg-emerald-400/[0.04]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center border border-emerald-400/30 bg-emerald-400/10">
                    <Icon className="h-5 w-5 text-emerald-300" aria-hidden />
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-emerald-300" aria-hidden />
                </div>
                <p className="mt-5 text-sm text-slate-400">{signal.label}</p>
                <p className="mt-2 text-xl font-semibold">{signal.value}</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">{signal.detail}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 sm:px-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Institution overview</p>
            <h2 className="mt-2 text-3xl font-semibold">Executive areas</h2>
          </div>
          <Link href="/operator/operations" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
            Open operations
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {institutionAreas.map((area) => {
            const Icon = area.icon;
            return (
              <Link
                key={area.label}
                href={area.href}
                className="group flex min-h-48 flex-col justify-between border border-white/10 bg-white/[0.02] p-5 transition hover:border-emerald-300/45 hover:bg-emerald-400/[0.04]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center border border-emerald-400/30 bg-emerald-400/10">
                    <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-emerald-300" aria-hidden />
                </div>
                <div className="mt-8">
                  <h3 className="text-xl font-semibold">{area.label}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{area.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
