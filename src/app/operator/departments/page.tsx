import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Calculator,
  FileCheck2,
  Headphones,
  Landmark,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import { requireOperatorPage } from "@/server/auth/require-operator-page";

export const metadata: Metadata = {
  title: "Department Workspaces | SAIN Finance",
  description: "Role-oriented internal department workspaces for SAIN Finance.",
};

const departments = [
  {
    id: "executive",
    label: "Executive Administration",
    description: "Institution oversight, workforce authority, approvals, security, and cross-department review.",
    icon: Landmark,
  },
  {
    id: "lending",
    label: "Lending",
    description: "Applications, underwriting review, approvals, funding readiness, and servicing handoff.",
    icon: BadgeDollarSign,
  },
  {
    id: "accounting",
    label: "Accounting",
    description: "Journal activity, postings, reversals, balances, reconciliation, and close controls.",
    icon: Calculator,
  },
  {
    id: "compliance",
    label: "Compliance",
    description: "Control exceptions, account restrictions, document review, monitoring, and escalation.",
    icon: Scale,
  },
  {
    id: "treasury",
    label: "Treasury & Settlement",
    description: "Reserve position, payment execution, settlement queues, issuance, and reconciliation.",
    icon: Landmark,
  },
  {
    id: "documents",
    label: "Document Operations",
    description: "Institutional records, agreements, instruments, authority documents, and controlled versions.",
    icon: FileCheck2,
  },
  {
    id: "customer-service",
    label: "Customer Service",
    description: "Relationship support, servicing requests, account status, disputes, and routed assistance.",
    icon: Headphones,
  },
  {
    id: "security",
    label: "Security & Access",
    description: "Sessions, login activity, employee access, restrictions, and operator account controls.",
    icon: ShieldCheck,
  },
  {
    id: "human-resources",
    label: "Human Resources",
    description: "Employee directory, account provisioning, department placement, and workforce status.",
    icon: Users,
  },
] as const;

export default async function DepartmentDirectoryPage() {
  const session = await requireOperatorPage("/operator/departments");

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/operator/control-center" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">S</span>
            <span className="text-sm font-semibold uppercase tracking-[0.28em]">SAIN DEPARTMENT WORKSPACES</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <LockKeyhole className="h-4 w-4 text-emerald-300" aria-hidden />
            <span>{session.email}</span>
            <Link href="/operator/control-center" className="border border-white/10 px-3 py-2 text-slate-300 hover:border-emerald-300/50 hover:text-white">CEO Control Center</Link>
          </div>
        </div>
      </header>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Internal institution structure</p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Department workspaces</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
            Each department receives a dedicated operating surface with its own queues, controls, records, and handoffs while remaining inside the same authenticated SAIN institution.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((department) => {
            const Icon = department.icon;
            return (
              <Link
                key={department.id}
                href={`/operator/departments/${department.id}`}
                className="group flex min-h-56 flex-col justify-between border border-white/10 bg-white/[0.02] p-5 transition hover:border-emerald-300/45 hover:bg-emerald-400/[0.04]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center border border-emerald-400/30 bg-emerald-400/10">
                    <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-emerald-300" aria-hidden />
                </div>
                <div className="mt-8">
                  <h2 className="text-xl font-semibold">{department.label}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{department.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
