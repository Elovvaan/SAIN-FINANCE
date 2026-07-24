import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Calculator,
  ClipboardCheck,
  Database,
  FileCheck2,
  Headphones,
  Landmark,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { requireOperatorPage } from "@/server/auth/require-operator-page";

export const metadata: Metadata = {
  title: "Department Workspace | SAIN Finance",
  description: "Authenticated SAIN Finance department workspace.",
};

const departmentConfig = {
  executive: {
    label: "Executive Administration",
    icon: Landmark,
    description: "Institution-wide oversight, approvals, workforce authority, and control escalation.",
    queues: ["Pending approvals", "Executive exceptions", "Cross-department escalations"],
    controls: [
      { label: "Employee administration", href: "/operator/control-center/employees", icon: Users },
      { label: "Institution overview", href: "/operator/control-center", icon: Activity },
      { label: "Institutional repository", href: "/operator/repository", icon: FileCheck2 },
    ],
  },
  lending: {
    label: "Lending",
    icon: BadgeDollarSign,
    description: "Applications, underwriting, approvals, funding readiness, and servicing handoffs.",
    queues: ["Applications", "Underwriting review", "Approved for funding"],
    controls: [
      { label: "Application intake", href: "/operator/operations?view=intake", icon: ClipboardCheck },
      { label: "Approval review", href: "/operator/operations?view=admin", icon: Workflow },
      { label: "Funding handoff", href: "/operator/operations?view=treasury", icon: Landmark },
    ],
  },
  accounting: {
    label: "Accounting",
    icon: Calculator,
    description: "Journal activity, postings, reversals, balances, reconciliation, and close controls.",
    queues: ["Pending posting", "Reversal review", "Reconciliation exceptions"],
    controls: [
      { label: "Ledger", href: "/operator/operations?view=ledger", icon: Database },
      { label: "Control state", href: "/operator/operations?view=kernel", icon: Workflow },
      { label: "Settlement reconciliation", href: "/operator/operations?view=treasury", icon: Landmark },
    ],
  },
  compliance: {
    label: "Compliance",
    icon: Scale,
    description: "Control exceptions, account restrictions, monitoring, document review, and escalation.",
    queues: ["Compliance alerts", "Document review", "Restricted account review"],
    controls: [
      { label: "Administrative review", href: "/operator/operations?view=admin", icon: ShieldCheck },
      { label: "Institutional repository", href: "/operator/repository", icon: FileCheck2 },
      { label: "Audit trail", href: "/operator/operations?view=kernel", icon: Activity },
    ],
  },
  treasury: {
    label: "Treasury & Settlement",
    icon: Landmark,
    description: "Reserve position, payment execution, settlement queues, issuance, and reconciliation.",
    queues: ["Payment execution", "Settlement pending", "Reconciliation review"],
    controls: [
      { label: "Treasury operations", href: "/operator/operations?view=treasury", icon: Landmark },
      { label: "Ledger postings", href: "/operator/operations?view=ledger", icon: Database },
      { label: "Asset readiness", href: "/operator/operations?view=assets", icon: Workflow },
    ],
  },
  documents: {
    label: "Document Operations",
    icon: FileCheck2,
    description: "Institutional records, agreements, instruments, authority documents, and controlled versions.",
    queues: ["New uploads", "Integrity review", "Version freeze requests"],
    controls: [
      { label: "Institutional repository", href: "/operator/repository", icon: FileCheck2 },
      { label: "Legacy repository view", href: "/operator/documents", icon: ClipboardCheck },
      { label: "Audit history", href: "/operator/operations?view=kernel", icon: Activity },
    ],
  },
  "customer-service": {
    label: "Customer Service",
    icon: Headphones,
    description: "Relationship support, servicing requests, account status, disputes, and routed assistance.",
    queues: ["New service requests", "Account questions", "Disputes and escalations"],
    controls: [
      { label: "Customer intake", href: "/operator/operations?view=intake", icon: ClipboardCheck },
      { label: "Administrative review", href: "/operator/operations?view=admin", icon: ShieldCheck },
      { label: "Institutional repository", href: "/operator/repository", icon: FileCheck2 },
    ],
  },
  security: {
    label: "Security & Access",
    icon: ShieldCheck,
    description: "Sessions, login activity, employee access, restrictions, and operator account controls.",
    queues: ["Access alerts", "Suspended accounts", "Session review"],
    controls: [
      { label: "Employee access", href: "/operator/control-center/employees", icon: Users },
      { label: "Administrative review", href: "/operator/operations?view=admin", icon: AlertTriangle },
      { label: "Audit trail", href: "/operator/operations?view=kernel", icon: Activity },
    ],
  },
  "human-resources": {
    label: "Human Resources",
    icon: Users,
    description: "Employee directory, account provisioning, department placement, and workforce status.",
    queues: ["New employees", "Role changes", "Suspension and reactivation"],
    controls: [
      { label: "Employee management", href: "/operator/control-center/employees", icon: Users },
      { label: "Security review", href: "/operator/departments/security", icon: ShieldCheck },
      { label: "Executive escalation", href: "/operator/departments/executive", icon: Landmark },
    ],
  },
} as const;

type DepartmentId = keyof typeof departmentConfig;

export default async function DepartmentWorkspacePage({
  params,
}: {
  params: Promise<{ department: string }>;
}) {
  const { department } = await params;
  if (!(department in departmentConfig)) notFound();

  const config = departmentConfig[department as DepartmentId];
  const session = await requireOperatorPage(`/operator/departments/${department}`);
  const DepartmentIcon = config.icon;

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/operator/departments" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">S</span>
            <span className="text-sm font-semibold uppercase tracking-[0.28em]">SAIN {config.label}</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <LockKeyhole className="h-4 w-4 text-emerald-300" aria-hidden />
            <span>{session.email}</span>
            <Link href="/operator/repository" className="border border-white/10 px-3 py-2 text-slate-300 hover:border-emerald-300/50 hover:text-white">Repository</Link>
            <Link href="/operator/departments" className="border border-white/10 px-3 py-2 text-slate-300 hover:border-emerald-300/50 hover:text-white">All departments</Link>
          </div>
        </div>
      </header>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <Link href="/operator/departments" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Department directory
          </Link>
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Authorized department workspace</p>
              <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">{config.label}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{config.description}</p>
            </div>
            <span className="flex h-16 w-16 items-center justify-center border border-emerald-400/30 bg-emerald-400/10">
              <DepartmentIcon className="h-8 w-8 text-emerald-300" aria-hidden />
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="grid gap-4 md:grid-cols-3">
            {config.queues.map((queue) => (
              <div key={queue} className="border border-white/10 bg-white/[0.025] p-5">
                <p className="text-sm text-slate-400">{queue}</p>
                <p className="mt-3 text-xl font-semibold">Open queue</p>
              </div>
            ))}
          </div>

          <div className="mt-6 border border-white/10 bg-white/[0.02]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Department controls</p>
              <h2 className="mt-2 text-2xl font-semibold">Primary work areas</h2>
            </div>
            <div className="grid gap-0 divide-y divide-white/10">
              {config.controls.map((control) => {
                const Icon = control.icon;
                return (
                  <Link key={control.label} href={control.href} className="group flex items-center justify-between gap-4 p-5 transition hover:bg-emerald-400/[0.04]">
                    <div className="flex items-center gap-4">
                      <span className="flex h-10 w-10 items-center justify-center border border-emerald-400/25 bg-emerald-400/10">
                        <Icon className="h-5 w-5 text-emerald-300" aria-hidden />
                      </span>
                      <span className="font-semibold">{control.label}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-emerald-300" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="border border-white/10 bg-white/[0.025] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Workspace identity</p>
          <h2 className="mt-2 text-2xl font-semibold">Department access</h2>
          <div className="mt-6 grid gap-4 text-sm">
            <div className="border border-white/10 p-4">
              <p className="text-slate-500">Signed in operator</p>
              <p className="mt-2 font-semibold">{session.displayName || session.email}</p>
            </div>
            <div className="border border-white/10 p-4">
              <p className="text-slate-500">Active roles</p>
              <p className="mt-2 font-semibold">{session.roles.join(", ")}</p>
            </div>
            <div className="border border-white/10 p-4">
              <p className="text-slate-500">Permission count</p>
              <p className="mt-2 text-2xl font-semibold">{session.permissions.length}</p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
