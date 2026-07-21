import type { Metadata } from "next";
import Link from "next/link";
import { Database, FileInput, Landmark, LockKeyhole, PackageCheck, ShieldCheck, Workflow } from "lucide-react";
import { requireOperatorPage } from "@/server/auth/require-operator-page";

export const metadata: Metadata = {
  title: "Internal Operations | SAIN Finance",
  description: "Authenticated SAIN internal operations workspace.",
};

const operations = [
  { id: "intake", label: "Intake", description: "Receive and validate operational claims before admission.", icon: FileInput },
  { id: "kernel", label: "Kernel", description: "Review validation, admission, commit, projection, and response states.", icon: Workflow },
  { id: "ledger", label: "Ledger", description: "Inspect append-only financial events and projected balances.", icon: Database },
  { id: "assets", label: "Asset Operations", description: "Manage institutional asset records and settlement preparation.", icon: PackageCheck },
  { id: "treasury", label: "Treasury", description: "Review reserve, authority, issuance, redemption, and reconciliation controls.", icon: Landmark },
  { id: "admin", label: "Admin Review", description: "Handle restrictions, exceptions, disputes, and manual review.", icon: ShieldCheck },
] as const;

type OperationId = (typeof operations)[number]["id"];

export default async function InternalOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireOperatorPage();
  const params = await searchParams;
  const activeId = operations.some((item) => item.id === params.view) ? (params.view as OperationId) : "intake";
  const active = operations.find((item) => item.id === activeId) ?? operations[0];
  const ActiveIcon = active.icon;

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">S</span>
            <span className="text-sm font-semibold uppercase tracking-[0.28em]">SAIN INTERNAL OPERATIONS</span>
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <LockKeyhole className="h-4 w-4 text-emerald-300" aria-hidden />
            <span>{session.email}</span>
            <Link href="/operator/login" className="border border-white/10 px-3 py-2 text-slate-300 hover:border-emerald-300/50 hover:text-white">Operator account</Link>
          </div>
        </div>
      </header>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Authorized operator workspace</p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Internal operations</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">Kernel, ledger, treasury, intake, asset operations, and administrative review are internal infrastructure. They are no longer exposed as customer workspace tabs.</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-10 sm:px-8 lg:grid-cols-[280px_1fr]">
        <nav className="grid content-start gap-2" aria-label="Internal operations">
          {operations.map((item) => {
            const Icon = item.icon;
            const selected = item.id === activeId;
            return (
              <Link
                key={item.id}
                href={`/operator/operations?view=${item.id}`}
                aria-current={selected ? "page" : undefined}
                className={`flex items-center gap-3 border px-4 py-3 text-sm font-semibold transition ${selected ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-100" : "border-white/10 text-slate-400 hover:border-emerald-300/35 hover:text-white"}`}
              >
                <Icon className="h-4 w-4 text-emerald-300" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <section className="border border-white/10 bg-white/[0.025] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 items-center justify-center border border-emerald-400/30 bg-emerald-400/10">
              <ActiveIcon className="h-6 w-6 text-emerald-300" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Current operation</p>
              <h2 className="mt-2 text-3xl font-semibold">{active.label}</h2>
              <p className="mt-4 max-w-2xl leading-7 text-slate-300">{active.description}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {["Queue", "Control state", "Audit history"].map((label) => (
              <div key={label} className="border border-white/10 p-5">
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-3 text-lg font-semibold">Sandbox ready</p>
              </div>
            ))}
          </div>

          <div className="mt-6 border border-emerald-400/20 bg-emerald-400/[0.06] p-5 text-sm leading-7 text-slate-300">
            This authenticated shell establishes the correct product boundary. Detailed operational tools remain sandbox-only and will be connected here without exposing them to worker, employer, staffing, or partner navigation.
          </div>
        </section>
      </div>
    </main>
  );
}
