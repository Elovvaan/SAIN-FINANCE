"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Factory,
  FileCheck2,
  FileText,
  Fingerprint,
  Handshake,
  LineChart,
  Landmark,
  Layers3,
  LockKeyhole,
  Network,
  SendHorizontal,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const navItems = [
  ["Home", "#home"],
  ["Career", "/platform/career"],
  ["Employer", "/platform/employer"],
  ["Staffing", "/platform/staffing"],
  ["Partners", "/platform/partners"],
  ["Platform", "#platform-architecture"],
  ["About", "#about"],
  ["Contact", "#contact"],
] as const;

const kernelStages: {
  title: string;
  copy: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Claim",
    copy: "Financial request received",
    icon: FileText,
  },
  {
    title: "Validation",
    copy: "Identity and policy verified",
    icon: ShieldCheck,
  },
  {
    title: "Admission",
    copy: "Approved for the kernel",
    icon: Fingerprint,
  },
  {
    title: "Commit",
    copy: "Double-entry journal created",
    icon: FileCheck2,
  },
  {
    title: "Ledger",
    copy: "Immutable event recorded",
    icon: Database,
  },
  {
    title: "Projection",
    copy: "Available balance calculated",
    icon: LineChart,
  },
  {
    title: "Response",
    copy: "Updated financial state returned",
    icon: SendHorizontal,
  },
];

const platformCards = [
  {
    icon: CircleDollarSign,
    title: "Payroll-centered accounts",
    copy: "Designed around earnings as the primary financial event, not an afterthought attached to a generic wallet.",
  },
  {
    icon: Database,
    title: "Immutable financial ledger",
    copy: "Every state change is grounded in an auditable record, supporting clarity for users and partners.",
  },
  {
    icon: Workflow,
    title: "Event-driven financial kernel",
    copy: "Claims move through a disciplined pipeline before money movement or balance presentation changes.",
  },
  {
    icon: ShieldCheck,
    title: "Transparent money movement",
    copy: "The platform prioritizes clear states, explainable outcomes, and traceable account activity.",
  },
  {
    icon: Layers3,
    title: "Future-ready infrastructure",
    copy: "A foundation built to support employer, payroll, banking, and fintech collaboration over time.",
  },
];

const partnerCards = [
  {
    title: "Why SAIN",
    copy: "A paycheck-first account model gives partners a focused way to approach worker earnings, account trust, and financial clarity.",
  },
  {
    title: "Our Architecture",
    copy: "The Financial Kernel creates a predictable flow for claims, validations, ledger entries, projections, and responses.",
  },
  {
    title: "Partner Qualification Philosophy",
    copy: "SAIN is built for disciplined collaboration with institutions that value correctness, compliance posture, and operational transparency.",
  },
  {
    title: "Financial Kernel",
    copy: "The kernel is the system of record and the decision path that governs how account state may change.",
  },
  {
    title: "Future Collaboration",
    copy: "SAIN is preparing for thoughtful partnerships across payroll, sponsor banking, banking-as-a-service, and financial infrastructure.",
  },
];

const partnerAudiences = [
  { icon: Landmark, label: "Sponsor Banks" },
  { icon: Network, label: "BaaS Providers" },
  { icon: Factory, label: "Payroll Infrastructure" },
  { icon: Building2, label: "Fintech Partners" },
];

const employerItems = [
  "Off-cycle payroll support",
  "Payroll correction workflows",
  "Employee pay accounts",
  "Financial transparency",
];

const workspaceCards = [
  {
    title: "Career OS",
    description: "Your personal career workspace.",
    button: "Activate Career OS",
    href: "/platform/career",
    icon: Fingerprint,
  },
  {
    title: "Employer OS",
    description: "Manage and support your workforce.",
    button: "Activate Employer Workspace",
    href: "/platform/employer",
    icon: Building2,
  },
  {
    title: "Staffing OS",
    description: "Recruit, place and manage talent.",
    button: "Activate Staffing Workspace",
    href: "/platform/staffing",
    icon: Factory,
  },
  {
    title: "Partner Center",
    description: "Sponsor banks and strategic partners.",
    button: "Partner Portal",
    href: "/platform/partners",
    icon: Landmark,
  },
] as const;

const platformWorkspaces = [
  "Career OS",
  "Employer OS",
  "Staffing OS",
  "Financial OS (Coming Soon)",
  "Partner Center",
  "Admin Console",
];

const accountTypes = ["Worker", "Employer", "Staffing Agency", "Partner", "Admin"];

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/[0.82] backdrop-blur-xl">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <a href="#home" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">
            S
          </span>
          <span className="text-sm font-semibold uppercase tracking-[0.28em] text-white">
            SAIN
          </span>
        </a>

        <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 lg:flex">
          {navItems.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <a
            href="#contact"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300"
          >
            Contact
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </nav>
    </header>
  );
}

function KernelVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative mx-auto w-full overflow-hidden border border-emerald-400/20 bg-[#020504] shadow-2xl shadow-emerald-950/20 ${
        compact ? "max-w-3xl p-4 sm:p-6" : "max-w-5xl p-4 sm:p-7"
      }`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(52,211,153,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(52,211,153,0.05)_1px,transparent_1px)] bg-[size:42px_42px] opacity-55" />
      <div className="absolute inset-x-0 top-0 h-px bg-emerald-300/60" />
      <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative min-h-[720px] md:min-h-[560px]">
        <svg
          viewBox="0 0 900 560"
          className="absolute inset-0 hidden h-full w-full md:block"
          aria-hidden="true"
        >
          <defs>
            <filter id="kernelGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="kernelCore" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.55" />
              <stop offset="42%" stopColor="#10b981" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#020504" stopOpacity="0" />
            </radialGradient>
          </defs>

          <path d="M88 182 C172 182 212 248 310 266" stroke="rgba(52,211,153,.24)" strokeWidth="1.2" fill="none" />
          <path d="M88 280 C176 280 214 286 310 286" stroke="rgba(52,211,153,.22)" strokeWidth="1.2" fill="none" />
          <path d="M88 378 C176 378 214 322 310 306" stroke="rgba(52,211,153,.24)" strokeWidth="1.2" fill="none" />
          <motion.path
            d="M88 182 C172 182 212 248 310 266"
            stroke="#34d399"
            strokeWidth="1.8"
            strokeDasharray="12 18"
            animate={{ strokeDashoffset: [0, -140], opacity: [0.25, 0.9, 0.35] }}
            transition={{ duration: 5.8, repeat: Infinity, ease: "linear" }}
            filter="url(#kernelGlow)"
            fill="none"
          />
          <motion.path
            d="M88 280 C176 280 214 286 310 286"
            stroke="#34d399"
            strokeWidth="1.8"
            strokeDasharray="12 18"
            animate={{ strokeDashoffset: [0, -140], opacity: [0.18, 0.8, 0.28] }}
            transition={{ duration: 6.4, delay: 0.4, repeat: Infinity, ease: "linear" }}
            filter="url(#kernelGlow)"
            fill="none"
          />
          <motion.path
            d="M88 378 C176 378 214 322 310 306"
            stroke="#34d399"
            strokeWidth="1.8"
            strokeDasharray="12 18"
            animate={{ strokeDashoffset: [0, -140], opacity: [0.22, 0.86, 0.3] }}
            transition={{ duration: 6.1, delay: 0.8, repeat: Infinity, ease: "linear" }}
            filter="url(#kernelGlow)"
            fill="none"
          />

          <path d="M590 272 C666 252 706 188 810 172" stroke="rgba(52,211,153,.24)" strokeWidth="1.2" fill="none" />
          <path d="M592 304 C676 318 710 376 814 392" stroke="rgba(52,211,153,.24)" strokeWidth="1.2" fill="none" />
          <motion.path
            d="M590 272 C666 252 706 188 810 172"
            stroke="#34d399"
            strokeWidth="1.8"
            strokeDasharray="12 18"
            animate={{ strokeDashoffset: [0, -140], opacity: [0.25, 0.92, 0.35] }}
            transition={{ duration: 5.8, delay: 1.6, repeat: Infinity, ease: "linear" }}
            filter="url(#kernelGlow)"
            fill="none"
          />
          <motion.path
            d="M592 304 C676 318 710 376 814 392"
            stroke="#34d399"
            strokeWidth="1.8"
            strokeDasharray="12 18"
            animate={{ strokeDashoffset: [0, -140], opacity: [0.2, 0.8, 0.28] }}
            transition={{ duration: 6.4, delay: 2.1, repeat: Infinity, ease: "linear" }}
            filter="url(#kernelGlow)"
            fill="none"
          />

          {[0, 1, 2].map((item) => (
            <motion.circle
              key={`claim-particle-${item}`}
              r="3"
              fill="#6ee7b7"
              animate={{
                cx: [90, 182, 268, 350],
                cy: [182 + item * 98, 208 + item * 48, 252 + item * 18, 284],
                opacity: [0, 1, 0.9, 0],
              }}
              transition={{
                duration: 4.2,
                delay: item * 0.7,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              filter="url(#kernelGlow)"
            />
          ))}
          {[0, 1].map((item) => (
            <motion.circle
              key={`admitted-particle-${item}`}
              r="3"
              fill="#6ee7b7"
              animate={{
                cx: [550, 650, 730, 812],
                cy: [286, item === 0 ? 252 : 318, item === 0 ? 190 : 376, item === 0 ? 172 : 392],
                opacity: [0, 1, 0.9, 0],
              }}
              transition={{
                duration: 4.5,
                delay: 1.7 + item * 0.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              filter="url(#kernelGlow)"
            />
          ))}

          <circle cx="450" cy="286" r="158" fill="url(#kernelCore)" />
          <motion.circle
            cx="450"
            cy="286"
            r="134"
            fill="none"
            stroke="rgba(52,211,153,.45)"
            strokeWidth="1.2"
            strokeDasharray="18 16"
            animate={{ rotate: 360 }}
            transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "450px 286px" }}
          />
          <motion.circle
            cx="450"
            cy="286"
            r="104"
            fill="none"
            stroke="rgba(110,231,183,.28)"
            strokeWidth="1"
            strokeDasharray="5 12"
            animate={{ rotate: -360 }}
            transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "450px 286px" }}
          />
          <motion.path
            d="M368 286 H532 M450 204 V368 M391 227 L509 345 M509 227 L391 345"
            stroke="rgba(110,231,183,.35)"
            strokeWidth="1"
            strokeDasharray="7 11"
            animate={{ strokeDashoffset: [0, -90], opacity: [0.35, 0.85, 0.4] }}
            transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
          />
        </svg>

        <div className="grid grid-cols-1 gap-3 md:hidden">
          {[
            kernelStages[0],
            { title: "Financial Kernel", copy: "Validation, admission, commit, and projection happen inside the processing core.", icon: Workflow },
            kernelStages[4],
            kernelStages[6],
          ].map(({ title, copy, icon: Icon }, index) => (
            <motion.div
              key={title}
              className="relative border border-emerald-400/15 bg-black/45 p-4 backdrop-blur"
              initial={false}
              animate={{ opacity: [0.72, 1, 0.78] }}
              transition={{
                duration: 5,
                delay: index * 0.3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <p className="font-mono text-xs font-semibold text-emerald-300">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-white">
                {title}
              </h3>
              <p className="mt-2 text-[11px] leading-4 text-slate-400">
                {copy}
              </p>
              <div className="mt-4 flex items-center gap-3 md:block">
                <motion.div
                  className="flex h-12 w-12 items-center justify-center border border-emerald-400/25 bg-emerald-400/10 text-emerald-200 shadow-lg shadow-emerald-950/20"
                  animate={{
                    boxShadow: [
                      "0 0 0 rgba(52, 211, 153, 0)",
                      "0 0 28px rgba(52, 211, 153, .28)",
                      "0 0 0 rgba(52, 211, 153, 0)",
                    ],
                  }}
                  transition={{
                    duration: 4,
                    delay: index * 0.28,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </motion.div>
                <span className="h-px flex-1 bg-emerald-400/20" />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="hidden md:block">
          <div className="absolute left-[7%] top-[106px] w-28">
            <p className="font-mono text-xs font-semibold text-emerald-300">01</p>
            <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-white">Claim Intake</h3>
            <p className="mt-2 text-[11px] leading-4 text-slate-400">Requests enter as claims, not balances.</p>
          </div>
          <div className="absolute left-[8%] top-[206px] w-24 border border-emerald-400/20 bg-emerald-400/[0.08] p-3 text-center">
            <FileText className="mx-auto h-7 w-7 text-emerald-200" aria-hidden />
          </div>
          <div className="absolute left-[8%] top-[304px] w-24 border border-emerald-400/20 bg-emerald-400/[0.08] p-3 text-center">
            <ShieldCheck className="mx-auto h-7 w-7 text-emerald-200" aria-hidden />
          </div>
          <div className="absolute left-[8%] top-[402px] w-24 border border-emerald-400/20 bg-emerald-400/[0.08] p-3 text-center">
            <Fingerprint className="mx-auto h-7 w-7 text-emerald-200" aria-hidden />
          </div>

          <div className="absolute left-1/2 top-[46px] w-56 -translate-x-1/2 text-center">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Processing Core
            </p>
            <p className="mt-2 text-[11px] leading-4 text-slate-400">
              Validation, admission, commit, and projection happen inside the kernel.
            </p>
          </div>

          {[
            { label: "Validation", icon: ShieldCheck, className: "left-[33%] top-[176px]" },
            { label: "Admission", icon: Fingerprint, className: "right-[33%] top-[176px]" },
            { label: "Commit", icon: FileCheck2, className: "left-[33%] bottom-[124px]" },
            { label: "Projection", icon: LineChart, className: "right-[33%] bottom-[124px]" },
          ].map(({ label, icon: Icon, className }, index) => (
            <motion.div
              key={label}
              className={`absolute flex h-20 w-20 -translate-x-1/2 items-center justify-center border border-emerald-300/20 bg-black/50 text-emerald-200 backdrop-blur ${className}`}
              animate={{ opacity: [0.55, 1, 0.65], scale: [0.98, 1.04, 0.98] }}
              transition={{
                duration: 4.4,
                delay: index * 0.45,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Icon className="h-7 w-7" aria-hidden />
              <span className="absolute -bottom-6 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                {label}
              </span>
            </motion.div>
          ))}

          <div className="absolute right-[7%] top-[104px] w-28 text-right">
            <p className="font-mono text-xs font-semibold text-emerald-300">Admitted</p>
            <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-white">Financial Events</h3>
            <p className="mt-2 text-[11px] leading-4 text-slate-400">Only accepted state changes leave the core.</p>
          </div>
          <div className="absolute right-[6%] top-[214px] w-28 border border-emerald-400/20 bg-emerald-400/[0.08] p-4">
            <Database className="h-7 w-7 text-emerald-200" aria-hidden />
            <p className="mt-3 text-xs font-semibold uppercase text-white">Ledger</p>
          </div>
          <div className="absolute right-[6%] top-[382px] w-28 border border-emerald-400/20 bg-emerald-400/[0.08] p-4">
            <CircleDollarSign className="h-7 w-7 text-emerald-200" aria-hidden />
            <p className="mt-3 text-xs font-semibold uppercase text-white">Balance</p>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-8 hidden justify-center md:flex md:bottom-[132px]">
          <motion.div
            className="relative flex flex-col items-center"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.div
              className="relative h-40 w-40 border border-emerald-300/45 bg-emerald-400/10 shadow-2xl shadow-emerald-500/25"
              animate={{
                boxShadow: [
                  "0 0 22px rgba(52, 211, 153, .18)",
                  "0 0 54px rgba(52, 211, 153, .36)",
                  "0 0 22px rgba(52, 211, 153, .18)",
                ],
              }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="absolute inset-4 border border-emerald-200/25" />
              <div className="absolute inset-8 border border-emerald-200/15" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(110,231,183,0.22),transparent_62%)]" />
              <div className="absolute inset-x-6 -top-4 h-4 skew-x-[-28deg] border border-emerald-300/25 bg-emerald-300/10" />
              <div className="absolute -right-4 inset-y-6 w-4 skew-y-[-28deg] border border-emerald-300/25 bg-emerald-300/10" />
              <div className="relative flex h-full items-center justify-center">
                <span className="font-mono text-7xl font-semibold text-emerald-200">
                  S
                </span>
              </div>
            </motion.div>
            <div className="mt-6 text-center">
              <p className="font-mono text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300 sm:text-base">
                Financial Kernel
              </p>
              {!compact && (
                <p className="mt-2 text-xs text-slate-400">
                  Truth. Accuracy. Trust.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
        {eyebrow}
      </p>
      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-lg leading-8 text-slate-400">{copy}</p>
    </div>
  );
}

function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-emerald-400/30 bg-emerald-400/[0.08] p-8"
      >
        <CheckCircle2 className="h-10 w-10 text-emerald-300" aria-hidden />
        <h3 className="mt-6 text-2xl font-semibold text-white">
          Conversation requested.
        </h3>
        <p className="mt-3 leading-7 text-slate-300">
          Thank you for reaching out to SAIN Financial. A member of the team
          will review your inquiry and follow up with the appropriate next
          step.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-7 inline-flex h-11 items-center border border-white/15 px-5 text-sm font-semibold text-white transition hover:border-emerald-300/60 hover:text-emerald-200"
        >
          Send another inquiry
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {[
        ["Name", "text"],
        ["Company", "text"],
        ["Email", "email"],
        ["Role", "text"],
      ].map(([label, type]) => (
        <label key={label} className="grid gap-2 text-sm text-slate-300">
          {label}
          <input
            required={label !== "Role"}
            type={type}
            className="h-12 border border-white/[0.12] bg-white/[0.035] px-4 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300/70"
          />
        </label>
      ))}
      <label className="grid gap-2 text-sm text-slate-300">
        Inquiry Type
        <select
          required
          className="h-12 border border-white/[0.12] bg-[#080b0a] px-4 text-white outline-none transition focus:border-emerald-300/70"
        >
          <option>Partnership</option>
          <option>Sponsor Bank</option>
          <option>Payroll Infrastructure</option>
          <option>Employer Interest</option>
          <option>Investor Inquiry</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm text-slate-300">
        Message
        <textarea
          required
          rows={5}
          className="resize-none border border-white/[0.12] bg-white/[0.035] p-4 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300/70"
        />
      </label>
      <button
        type="submit"
        className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
      >
        Submit Inquiry
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}

function WorkspaceGateway() {
  return (
    <section
      id="home"
      className="relative overflow-hidden border-b border-white/10 pt-32 sm:pt-40"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-emerald-300/60" />
      <div className="absolute left-1/2 top-20 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="mx-auto max-w-4xl text-center"
        >
          <p className="mb-6 inline-flex border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
            SAIN Platform
          </p>
          <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-7xl lg:text-8xl">
            Welcome to SAIN
          </h1>
          <p className="mt-7 text-lg leading-8 text-slate-300 sm:text-xl">
            Choose your workspace to begin.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {workspaceCards.map(({ title, description, button, href, icon: Icon }, index) => (
            <motion.a
              key={title}
              href={href}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: index * 0.08, ease: "easeOut" }}
              className="group relative min-h-[300px] overflow-hidden border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-emerald-300/45 hover:bg-emerald-400/[0.055]"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-emerald-300/40 opacity-0 transition group-hover:opacity-100" />
              <div className="absolute -right-20 -top-20 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl transition group-hover:bg-emerald-400/20" />
              <div className="relative flex h-full flex-col">
                <div className="flex h-12 w-12 items-center justify-center border border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <div className="mt-10">
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    {title}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-slate-400">
                    {description}
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-2 pt-10 text-sm font-semibold text-emerald-200">
                  {button}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden />
                </span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformArchitecture() {
  return (
    <section id="platform-architecture" className="border-b border-white/10 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[.88fr_1.12fr]">
          <div>
            <SectionHeader
              eyebrow="Platform Architecture"
              title="One Platform. Multiple Workspaces."
              copy="SAIN gives each person or organization one account, then grants access to the workspace they need. The employer changes. The worker keeps SAIN."
            />
            <div className="mt-10 border border-emerald-400/20 bg-emerald-400/[0.06] p-6">
              <h3 className="text-xl font-semibold text-white">
                SAIN Financial inside the larger platform
              </h3>
              <p className="mt-4 leading-7 text-slate-300">
                SAIN Financial is the financial operating system within the
                larger SAIN Platform. It remains focused on disciplined
                financial architecture while the platform expands into career,
                employer, staffing, partner, and administrative workspaces.
              </p>
            </div>
          </div>

          <div className="border border-white/10 bg-white/[0.025] p-5 sm:p-8">
            <div className="border border-emerald-300/30 bg-emerald-400/[0.08] p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                Root Account
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-white">
                SAIN Platform
              </h3>
            </div>
            <div className="mx-auto h-10 w-px bg-emerald-300/40" />
            <div className="grid gap-3 sm:grid-cols-2">
              {platformWorkspaces.map((workspace) => {
                const comingSoon = workspace.includes("Coming Soon");
                return (
                  <div
                    key={workspace}
                    className={`border p-4 ${
                      comingSoon
                        ? "border-amber-300/25 bg-amber-300/[0.055]"
                        : "border-white/10 bg-black/35"
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">
                      {workspace.replace(" (Coming Soon)", "")}
                    </p>
                    {comingSoon && (
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                        Coming Soon
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <div className="border border-white/10 bg-white/[0.025] p-6">
            <h3 className="text-xl font-semibold text-white">
              One SAIN Account
            </h3>
            <p className="mt-4 leading-7 text-slate-400">
              Every person or organization creates one SAIN Account. The account
              determines which workspace or workspaces they can access.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {accountTypes.map((type) => (
              <div
                key={type}
                className="border border-white/10 bg-white/[0.025] p-5 text-sm font-semibold text-slate-200"
              >
                {type}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Nav />

      <WorkspaceGateway />
      <PlatformArchitecture />

      <section
        id="learn-more"
        className="relative overflow-hidden border-b border-white/10 py-24 sm:py-32"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-emerald-300/60" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <p className="mb-6 inline-flex border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
              Learn More
            </p>
            <h1 className="max-w-5xl text-5xl font-semibold tracking-tight text-white sm:text-7xl lg:text-8xl">
              The trusted destination for your paycheck.
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl sm:leading-9">
              SAIN Financial is building a payroll-centered financial platform
              designed around a Financial Kernel that prioritizes accuracy,
              transparency, and trust.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <a
                href="#partners"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
              >
                Partner With SAIN
                <Handshake className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href="#platform"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-sm font-semibold text-white transition hover:border-emerald-300/60 hover:text-emerald-200"
              >
                Explore the Platform
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </motion.div>

          <KernelVisual />
        </div>
      </section>

      <section id="platform" className="border-b border-white/10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeader
            eyebrow="Platform"
            title="Destination, account, kernel, correctness."
            copy="SAIN is being built as a trusted destination for worker earnings. The platform centers the paycheck, governs account state through a Financial Kernel, and earns trust through disciplined correctness."
          />

          <div className="mt-14 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
            {platformCards.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="bg-[#050706] p-6">
                <Icon className="h-7 w-7 text-emerald-300" aria-hidden />
                <h3 className="mt-8 text-lg font-semibold text-white">
                  {title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-slate-400">{copy}</p>
              </article>
            ))}
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "Destination, not rail.",
              "Account, not wallet.",
              "Kernel, not interface.",
              "Trust through correctness.",
            ].map((line) => (
              <div
                key={line}
                className="border-l border-emerald-300/50 bg-white/[0.025] px-5 py-4 text-sm font-semibold text-slate-200"
              >
                {line}
              </div>
            ))}
          </div>

          <a
            href="/platform/employment"
            className="mt-10 inline-flex items-center gap-2 border border-emerald-400/20 bg-emerald-400/[0.06] px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:border-emerald-300/60 hover:text-white"
          >
            Employment Platform Preview
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      <section id="kernel" className="border-b border-white/10 py-24 sm:py-32">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <SectionHeader
              eyebrow="Financial Kernel"
              title="A disciplined path before balances change."
              copy="Every financial action begins as a Claim. Before account balances change, the claim must pass through validation, admission, commit, ledger, projection, and response. The result is a clear operating model that executives, banks, and engineers can understand."
            />
            <div className="mt-10 space-y-5 text-slate-300">
              <p className="leading-8">
                The kernel is the decision layer and accounting discipline
                behind SAIN. It is built to make financial state changes
                intentional, traceable, and explainable.
              </p>
              <p className="leading-8">
                Instead of treating account balances as a display problem, SAIN
                treats them as the output of verified financial events.
              </p>
            </div>
          </div>
          <div className="grid gap-6">
            <KernelVisual compact />
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Claim", "A request or event enters the system."],
                ["Ledger", "Committed activity becomes auditable record."],
                ["Projection", "Readable account state is produced."],
              ].map(([title, copy]) => (
                <div key={title} className="border border-white/10 p-5">
                  <h3 className="text-base font-semibold text-white">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="partners" className="border-b border-white/10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr]">
            <SectionHeader
              eyebrow="Partners"
              title="Built for institutional conversations."
              copy="SAIN is preparing for collaboration with sponsor banks, banking-as-a-service providers, payroll infrastructure companies, and financial technology partners."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {partnerAudiences.map(({ icon: PartnerIcon, label }) => {
                return (
                  <div
                    key={label}
                    className="flex items-center gap-4 border border-white/10 bg-white/[0.025] p-5"
                  >
                    <PartnerIcon
                      className="h-6 w-6 text-emerald-300"
                      aria-hidden
                    />
                    <span className="font-semibold text-white">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-5">
            {partnerCards.map((card) => (
              <article key={card.title} className="bg-[#050706] p-6">
                <h3 className="text-lg font-semibold text-white">
                  {card.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-slate-400">
                  {card.copy}
                </p>
              </article>
            ))}
          </div>

          <a
            href="#contact"
            className="mt-12 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
          >
            Request a Partnership Conversation
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      <section id="employers" className="border-b border-white/10 py-24 sm:py-32">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_.9fr]">
          <SectionHeader
            eyebrow="Employers"
            title="Building toward better payroll experiences."
            copy="SAIN is building toward financial infrastructure that can improve how payroll events are understood, corrected, and presented to workers, without overstating features that are still in development."
          />
          <div className="border border-white/10 bg-white/[0.025] p-6 sm:p-8">
            <h3 className="text-xl font-semibold text-white">
              Future capabilities under exploration
            </h3>
            <div className="mt-7 grid gap-4">
              {employerItems.map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <BadgeCheck className="h-5 w-5 text-emerald-300" />
                  <span className="text-slate-300">{item}</span>
                </div>
              ))}
            </div>
            <a
              href="#contact"
              className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-sm font-semibold text-white transition hover:border-emerald-300/60 hover:text-emerald-200"
            >
              Join Employer Interest List
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section id="about" className="border-b border-white/10 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
                About
              </p>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                Financial discipline for worker earnings.
              </h2>
            </div>
            <div className="text-2xl leading-10 text-slate-200 sm:text-3xl sm:leading-[1.45]">
              <p>
                SAIN began with a simple question:{" "}
                <span className="text-white">
                  Why should access to your paycheck depend entirely on a
                  traditional banking experience?
                </span>
              </p>
              <p className="mt-8 text-lg leading-8 text-slate-400">
                Our mission is to build the most trusted destination for worker
                earnings through disciplined financial architecture.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="py-24 sm:py-32">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <SectionHeader
              eyebrow="Contact"
              title="Start the right conversation."
              copy="For partner, employer, investor, and infrastructure inquiries, share a few details and the SAIN Financial team will route the conversation."
            />
            <div className="mt-10 grid gap-4 text-sm text-slate-400">
              <div className="flex items-center gap-3">
                <LockKeyhole className="h-5 w-5 text-emerald-300" />
                Institutional partnership review
              </div>
              <div className="flex items-center gap-3">
                <Fingerprint className="h-5 w-5 text-emerald-300" />
                Payroll and account infrastructure focus
              </div>
            </div>
          </div>
          <div className="border border-white/10 bg-white/[0.025] p-5 sm:p-8">
            <ContactForm />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 text-sm text-slate-500 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold text-white">SAIN Financial</p>
            <p className="mt-2">Copyright 2026 SAIN Financial. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {navItems.map(([label, href]) => (
              <a key={href} href={href} className="transition hover:text-white">
                {label}
              </a>
            ))}
            <a href="#contact" className="transition hover:text-white">
              Privacy
            </a>
            <a href="#contact" className="transition hover:text-white">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
