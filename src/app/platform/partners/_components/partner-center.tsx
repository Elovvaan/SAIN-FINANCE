"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileCheck2,
  FileText,
  Fingerprint,
  Landmark,
  LineChart,
  LockKeyhole,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const navItems = [
  ["Overview", "overview"],
  ["Architecture", "architecture"],
  ["Kernel", "financial-kernel"],
  ["Integration", "integration-model"],
  ["Reconciliation", "reconciliation"],
  ["Compliance", "compliance"],
  ["Operations", "operations"],
  ["Scorecard", "scorecard"],
  ["Sandbox", "sandbox-demo"],
  ["Contact", "partner-contact"],
] as const;

const stack = [
  { label: "SAIN Website", owner: "SAIN", note: "Partner and worker-facing surfaces" },
  { label: "Employer OS", owner: "SAIN", note: "Employer workflows and pay-event intake" },
  { label: "Career OS", owner: "SAIN", note: "Portable worker career layer" },
  { label: "Admin Console", owner: "SAIN", note: "Review, support, and operational controls" },
  { label: "Financial Kernel", owner: "SAIN", note: "Claim decisioning and truth-state logic" },
  { label: "Bank Adapter", owner: "Shared", note: "Partner-specific translation boundary" },
  { label: "Sponsor Bank", owner: "Partner", note: "Regulated custody and banking rails" },
];

const kernelSteps = [
  { label: "Claim", icon: FileText },
  { label: "Validation", icon: ShieldCheck },
  { label: "Admission", icon: Fingerprint },
  { label: "Commit", icon: FileCheck2 },
  { label: "Ledger", icon: Database },
  { label: "Projection", icon: LineChart },
  { label: "Response", icon: Workflow },
];

const integrationPoints = [
  "Account creation",
  "Routing/account numbers",
  "Settlement data",
  "ACH/FedNow events",
  "Returns and reversals",
  "Reconciliation files or snapshots",
];

const reconciliationStates = [
  { label: "Matched", copy: "Expected internal state aligns with partner evidence.", tone: "emerald" },
  { label: "Expected In-Flight Difference", copy: "Known timing difference inside accepted partner windows.", tone: "slate" },
  { label: "Unexplained Divergence", copy: "Mismatch requiring review, evidence, and resolution workflow.", tone: "amber" },
  { label: "Resolved", copy: "Incident closed with recorded correction and audit trail.", tone: "emerald" },
];

const complianceCategories = [
  "KYC/KYB",
  "AML/BSA",
  "OFAC",
  "Transaction monitoring",
  "Dispute/error resolution",
  "Record retention",
  "Audit logging",
];

const operationalWorkflows = [
  { label: "Claims queue", icon: ClipboardList },
  { label: "Event log", icon: FileText },
  { label: "Manual review", icon: ClipboardCheck },
  { label: "Risk flags", icon: ShieldCheck },
  { label: "Support cases", icon: Building2 },
  { label: "Dispute review", icon: Scale },
  { label: "Reconciliation incidents", icon: RefreshCcw },
];

const architectureGates = [
  {
    question: "Can SAIN view reconciliation evidence per account or sub-account?",
    why: "Worker balances and employer events need explainable state resolution.",
    disqualifier: "Only aggregate program-level visibility is available.",
  },
  {
    question: "Are settlement events transparent and timestamped?",
    why: "The kernel must map partner evidence to internal ledger expectations.",
    disqualifier: "Settlement arrives as opaque batch totals only.",
  },
  {
    question: "Are returns and reversals fully supported?",
    why: "Payroll corrections require recoverable state transitions.",
    disqualifier: "Return reason codes or reversal lifecycle data are unavailable.",
  },
  {
    question: "Is there a clear account/routing strategy?",
    why: "Program architecture depends on account issuance and ownership boundaries.",
    disqualifier: "No supportable account model for worker pay destination use cases.",
  },
  {
    question: "Is event delivery idempotent?",
    why: "Duplicate or replayed events must not corrupt financial truth.",
    disqualifier: "No stable IDs, replay strategy, or delivery guarantees.",
  },
  {
    question: "Can SAIN preserve export and exit portability?",
    why: "Partner dependency cannot trap SAIN ledger or program data.",
    disqualifier: "No credible data export, migration, or exit process.",
  },
];

const survivabilityGates = [
  {
    question: "Is regulatory standing strong and current?",
    why: "SAIN needs partners with durable operating permission.",
    disqualifier: "Material unresolved regulatory concerns.",
  },
  {
    question: "Is program maturity demonstrated?",
    why: "Worker earnings workflows require proven operational discipline.",
    disqualifier: "No evidence from comparable programs.",
  },
  {
    question: "Is compliance ownership clear?",
    why: "Ambiguous ownership creates unacceptable launch risk.",
    disqualifier: "No written responsibility matrix.",
  },
  {
    question: "Is operational support reachable and accountable?",
    why: "Reconciliation and exceptions need fast partner response.",
    disqualifier: "No escalation path, SLA, or named support structure.",
  },
  {
    question: "Are exit terms survivable?",
    why: "SAIN must protect workers and employers if partner strategy changes.",
    disqualifier: "Termination terms threaten continuity or data access.",
  },
  {
    question: "Can the partner provide existing-program evidence?",
    why: "References and artifacts reduce integration uncertainty.",
    disqualifier: "No evidence, references, or operational proof.",
  },
];

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-white/10 bg-white/[0.025] ${className}`}>
      {children}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  copy,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t border-white/10 py-14 first:border-t-0 first:pt-0">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
          {eyebrow}
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {title}
        </h2>
        <p className="mt-4 text-base leading-7 text-slate-400">{copy}</p>
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function SmallMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5">
      <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
      <p className="mt-6 text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </Card>
  );
}

function ScorecardTable({
  title,
  rows,
}: {
  title: string;
  rows: typeof architectureGates;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">Question</th>
              <th className="px-5 py-4">Why it matters</th>
              <th className="px-5 py-4">Disqualifier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.question} className="align-top text-slate-300">
                <td className="px-5 py-4 font-semibold text-white">{row.question}</td>
                <td className="px-5 py-4 leading-6">{row.why}</td>
                <td className="px-5 py-4 leading-6 text-amber-100">{row.disqualifier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PartnerContactForm() {
  const [submitted, setSubmitted] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Card className="p-8">
        <CheckCircle2 className="h-9 w-9 text-emerald-300" aria-hidden />
        <h3 className="mt-6 text-2xl font-semibold text-white">Partner review requested.</h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
          This sandbox confirmation does not submit to a backend yet. It models the intake state for future partner review workflow.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-6 h-11 border border-white/15 px-5 text-sm font-semibold text-white transition hover:border-emerald-300/60 hover:text-emerald-200"
        >
          Reset form
        </button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        {[
          ["Name", "text"],
          ["Company", "text"],
          ["Email", "email"],
          ["Role", "text"],
        ].map(([label, type]) => (
          <label key={label} className="grid gap-2 text-sm text-slate-300">
            {label}
            <input
              required
              type={type}
              className="h-12 border border-white/[0.12] bg-white/[0.035] px-4 text-white outline-none focus:border-emerald-300/70"
            />
          </label>
        ))}
        <label className="grid gap-2 text-sm text-slate-300">
          Partner Type
          <select
            required
            className="h-12 border border-white/[0.12] bg-[#080b0a] px-4 text-white outline-none focus:border-emerald-300/70"
          >
            <option>Sponsor Bank</option>
            <option>Banking-as-a-Service</option>
            <option>Payroll Infrastructure</option>
            <option>Payments / Settlement Infrastructure</option>
            <option>Compliance / Operations Partner</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
          Message
          <textarea
            required
            rows={5}
            className="resize-none border border-white/[0.12] bg-white/[0.035] p-4 text-white outline-none focus:border-emerald-300/70"
          />
        </label>
        <button className="h-12 rounded-full bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300 md:w-fit">
          Request Partner Review
        </button>
      </form>
    </Card>
  );
}

export function PartnerCenter() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)]">
          <Card className="p-5">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">
                S
              </span>
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white">
                SAIN Partner
              </span>
            </Link>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              Private sandbox center for partner qualification. No live banking, custody, or compliance claims.
            </p>
            <nav className="mt-7 grid gap-1">
              {navItems.map(([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="border-l border-white/10 px-3 py-2 text-sm text-slate-400 transition hover:border-emerald-300/70 hover:text-white"
                >
                  {label}
                </a>
              ))}
            </nav>
          </Card>
        </aside>

        <div>
          <section className="pb-14 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
              Partner Center
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Qualification workspace for institutional partners.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
              A private-feeling sandbox for sponsor-bank, BaaS, payroll, and infrastructure review. It documents SAIN architecture, bank-independent layers, readiness workstreams, and partner gates before live money movement.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <SmallMetric icon={LockKeyhole} label="Mode" value="Private sandbox" />
              <SmallMetric icon={Landmark} label="Partner focus" value="Sponsor readiness" />
              <SmallMetric icon={Workflow} label="Core asset" value="Financial Kernel" />
            </div>
          </section>

          <Section
            id="overview"
            eyebrow="01 Overview"
            title="Worker-centered platform, bank-independent core."
            copy="SAIN Financial is building a worker-centered financial platform powered by a bank-independent Financial Kernel."
          >
            <Card className="p-6">
              <p className="max-w-4xl text-lg leading-8 text-slate-300">
                SAIN owns the experience, kernel, ledger model, employer workflows, employee workflows, admin review surfaces, and integration boundary. Regulated custody and live banking rails require a qualified partner.
              </p>
            </Card>
          </Section>

          <Section
            id="architecture"
            eyebrow="02 Architecture"
            title="SAIN owns the platform layers. Partners provide regulated rails."
            copy="The stack separates bank-independent product and truth-state logic from partner-specific banking infrastructure."
          >
            <div className="grid gap-3">
              {stack.map((item, index) => (
                <div key={item.label}>
                  <Card className="grid gap-3 p-5 sm:grid-cols-[220px_120px_1fr] sm:items-center">
                    <p className="font-semibold text-white">{item.label}</p>
                    <span className={`w-fit border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${item.owner === "SAIN" ? "border-emerald-400/25 text-emerald-200" : item.owner === "Partner" ? "border-amber-300/25 text-amber-100" : "border-slate-300/20 text-slate-300"}`}>
                      {item.owner}
                    </span>
                    <p className="text-sm text-slate-400">{item.note}</p>
                  </Card>
                  {index < stack.length - 1 && (
                    <ArrowDown className="mx-auto my-2 h-5 w-5 text-emerald-300/60" aria-hidden />
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section
            id="financial-kernel"
            eyebrow="03 Financial Kernel"
            title="External systems submit claims. The kernel decides financial truth."
            copy="The Financial Kernel transforms external inputs into controlled internal financial state."
          >
            <Card className="p-6">
              <div className="grid gap-3 lg:grid-cols-7">
                {kernelSteps.map(({ label, icon: Icon }, index) => (
                  <div key={label} className="relative border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                    <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
                    <p className="mt-5 text-sm font-semibold text-white">{label}</p>
                    {index < kernelSteps.length - 1 && (
                      <ArrowRight className="absolute right-2 top-4 hidden h-4 w-4 text-emerald-300/50 lg:block" />
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-6 border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-400">
                Claims may come from employer systems, payroll systems, admin review, partner event streams, or future APIs. The kernel controls validation, admission, commit, ledger state, projection, and response.
              </p>
            </Card>
          </Section>

          <Section
            id="integration-model"
            eyebrow="04 Integration Model"
            title="A partner-specific adapter protects the platform core."
            copy="The Bank Adapter translates regulated partner events into SAIN kernel claims and maps admitted platform state back into partner evidence."
          >
            <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
              <Card className="p-6">
                {["Sponsor Bank", "Bank Adapter", "Financial Kernel", "SAIN Platform"].map((item, index) => (
                  <div key={item}>
                    <div className="border border-white/10 bg-black/30 p-4 text-center font-semibold text-white">
                      {item}
                    </div>
                    {index < 3 && <ArrowDown className="mx-auto my-3 h-5 w-5 text-emerald-300" aria-hidden />}
                  </div>
                ))}
              </Card>
              <Card className="p-6">
                <h3 className="text-xl font-semibold text-white">Mock integration points</h3>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {integrationPoints.map((item) => (
                    <div key={item} className="border border-white/10 bg-black/30 p-4 text-sm font-semibold text-slate-200">
                      {item}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </Section>

          <Section
            id="reconciliation"
            eyebrow="05 Reconciliation Readiness"
            title="Designed around reconciliation-first logic."
            copy="SAIN's kernel is designed to compare internal expected state against partner evidence and escalate differences."
          >
            <div className="grid gap-4 lg:grid-cols-4">
              {reconciliationStates.map((state) => (
                <Card key={state.label} className="p-5">
                  <RefreshCcw className={`h-6 w-6 ${state.tone === "amber" ? "text-amber-200" : "text-emerald-300"}`} aria-hidden />
                  <h3 className="mt-5 font-semibold text-white">{state.label}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{state.copy}</p>
                </Card>
              ))}
            </div>
            <p className="mt-5 border-l border-amber-300/40 pl-4 text-sm leading-6 text-amber-100">
              Bank-specific timing, cutoff windows, and file formats are deferred until partner selection.
            </p>
          </Section>

          <Section
            id="compliance"
            eyebrow="06 Compliance Readiness"
            title="Compliance workstreams identified for partner review."
            copy="This center identifies review categories. It does not claim SAIN is fully compliant or operating a regulated program."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {complianceCategories.map((item) => (
                <Card key={item} className="p-5">
                  <Scale className="h-5 w-5 text-emerald-300" aria-hidden />
                  <p className="mt-5 text-sm font-semibold text-white">{item}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section
            id="operations"
            eyebrow="07 Operational Readiness"
            title="Mock operational workflows for live-program review."
            copy="These surfaces model how SAIN would triage exceptions, investigate events, and manage review queues once partner integrations are defined."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {operationalWorkflows.map(({ label, icon: Icon }) => (
                <Card key={label} className="p-5">
                  <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
                  <p className="mt-5 font-semibold text-white">{label}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section
            id="scorecard"
            eyebrow="08 Partner Qualification Scorecard"
            title="Partner gates for architecture and survivability."
            copy="The scorecard helps SAIN identify partners whose rails, operations, and program posture can support worker-centered financial infrastructure."
          >
            <div className="grid gap-6">
              <ScorecardTable title="Architecture Gates" rows={architectureGates} />
              <ScorecardTable title="Survivability Gates" rows={survivabilityGates} />
            </div>
          </Section>

          <Section
            id="sandbox-demo"
            eyebrow="09 Sandbox Demo"
            title="Employment Platform Sandbox"
            copy="This demonstrates the bank-independent platform layers already built before live money movement."
          >
            <Card className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h3 className="text-2xl font-semibold text-white">Employment Platform Sandbox</h3>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                  Employer workflows, employee views, Career OS, kernel simulator, ledger sandbox, and admin review can be demonstrated without live banking rails.
                </p>
              </div>
              <Link
                href="/platform/employment"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
              >
                Open sandbox
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Card>
          </Section>

          <Section
            id="partner-contact"
            eyebrow="10 Partner Contact"
            title="Request Partner Review"
            copy="Use this sandbox form to model partner review intake. No backend submission is connected yet."
          >
            <PartnerContactForm />
          </Section>
        </div>
      </div>
    </main>
  );
}
