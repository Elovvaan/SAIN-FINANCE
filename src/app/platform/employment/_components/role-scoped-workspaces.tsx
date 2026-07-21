"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  FileText,
  Headphones,
  Home,
  LogOut,
  RotateCcw,
  UserRound,
  UsersRound,
} from "lucide-react";

type SupportCase = {
  id: string;
  subject: string;
  detail: string;
  status: "Open";
  createdAt: string;
};

const workerNav = [
  { label: "Home", href: "#worker-home", icon: Home },
  { label: "Pay", href: "#worker-pay", icon: CircleDollarSign },
  { label: "Activity", href: "#worker-activity", icon: Activity },
  { label: "Documents", href: "#worker-documents", icon: FileText },
  { label: "Support", href: "#worker-support", icon: Headphones },
  { label: "Career", href: "/platform/employment/career", icon: BriefcaseBusiness },
  { label: "Profile", href: "#worker-profile", icon: UserRound },
] as const;

const employerNav = [
  { label: "Overview", href: "#employer-overview" },
  { label: "Workforce", href: "#employer-workforce" },
  { label: "Payroll", href: "#employer-payroll" },
  { label: "Funding", href: "#employer-funding" },
  { label: "Disbursements", href: "#employer-disbursements" },
  { label: "Corrections", href: "#employer-corrections" },
  { label: "Reports", href: "#employer-reports" },
  { label: "Settings", href: "#employer-settings" },
] as const;

function Shell({
  label,
  children,
  nav,
}: {
  label: string;
  children: React.ReactNode;
  nav: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">S</span>
            <span className="text-sm font-semibold uppercase tracking-[0.28em]">SAIN</span>
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            <span className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300 sm:block">{label}</span>
            {nav}
            <Link href="/" className="inline-flex h-10 items-center gap-2 border border-white/10 px-3 text-sm text-slate-300 hover:border-emerald-300/50 hover:text-white">
              <LogOut className="h-4 w-4" /> Exit demo
            </Link>
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="border border-white/10 bg-white/[0.025] p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function WorkerWorkspacePage() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [subject, setSubject] = useState("Payroll correction question");
  const [detail, setDetail] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("sain-worker-support-cases");
    if (!stored) return;
    try { setCases(JSON.parse(stored) as SupportCase[]); } catch { window.sessionStorage.removeItem("sain-worker-support-cases"); }
  }, []);

  useEffect(() => {
    if (cases.length === 0) {
      window.sessionStorage.removeItem("sain-worker-support-cases");
      return;
    }
    window.sessionStorage.setItem("sain-worker-support-cases", JSON.stringify(cases));
  }, [cases]);

  const activity = useMemo(
    () => [
      ...cases.map((item) => `Support case ${item.id} opened: ${item.subject}`),
      "Expected paycheck refreshed to $2,840.00",
      "Employment standing confirmed as active",
      "Payroll correction window opened",
    ],
    [cases],
  );

  function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCases((current) => {
      const next: SupportCase = {
        id: `SC-${String(current.length + 1).padStart(3, "0")}`,
        subject,
        detail: detail || "Worker requested review of a paycheck-related issue.",
        status: "Open",
        createdAt: new Date().toLocaleString(),
      };
      return [next, ...current];
    });
    setDetail("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function resetDemo() {
    setCases([]);
    window.sessionStorage.removeItem("sain-worker-support-cases");
  }

  return (
    <Shell
      label="Worker Workspace"
      nav={
        <nav className="hidden gap-2 overflow-x-auto lg:flex" aria-label="Worker navigation">
          {workerNav.map(({ label, href, icon: Icon }) => (
            <Link key={label} href={href} className="inline-flex items-center gap-2 whitespace-nowrap border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-emerald-300/50 hover:text-white">
              <Icon className="h-4 w-4 text-emerald-300" aria-hidden /> {label}
            </Link>
          ))}
        </nav>
      }
    >
      <section id="worker-home" className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Worker dashboard</p>
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-semibold sm:text-6xl">Welcome back, Maya.</h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">Track your pay, employment activity, documents, and support requests from one worker-owned workspace.</p>
            </div>
            <button onClick={resetDemo} className="inline-flex h-11 items-center justify-center gap-2 border border-white/10 px-4 text-sm text-slate-300 hover:border-emerald-300/50 hover:text-white">
              <RotateCcw className="h-4 w-4" /> Reset demo
            </button>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              ["Employment", "Active"],
              ["Expected pay", "$2,840"],
              ["Next payday", "Friday"],
              ["Open support cases", String(cases.length)],
            ].map(([label, value]) => (
              <div key={label} className="border border-white/10 bg-white/[0.025] p-5">
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-3 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-10 sm:px-8 lg:grid-cols-2">
        <Card id="worker-pay" title="Pay">
          <div className="grid gap-3">
            {[
              ["Expected payroll", "$2,840.00", "Projected"],
              ["Off-cycle event", "$420.00", "Pending review"],
              ["Correction window", "Open", "Action available"],
            ].map(([label, value, status]) => (
              <div key={label} className="flex items-center justify-between border border-white/10 p-4">
                <div><p className="font-semibold">{label}</p><p className="mt-1 text-xs text-slate-500">{status}</p></div>
                <p className="font-mono text-emerald-200">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card id="worker-activity" title="Activity">
          <div className="grid gap-3">
            {activity.map((item) => <div key={item} className="border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-300">{item}</div>)}
          </div>
        </Card>

        <Card id="worker-documents" title="Documents">
          <div className="grid gap-3 sm:grid-cols-2">
            {["Employment agreement", "Pay profile", "Tax forms", "Identity documents"].map((item) => (
              <button key={item} className="flex items-center gap-3 border border-white/10 p-4 text-left text-sm hover:border-emerald-300/50">
                <FileText className="h-5 w-5 text-emerald-300" /> {item}
              </button>
            ))}
          </div>
        </Card>

        <Card id="worker-profile" title="Profile">
          <div className="grid gap-3 text-sm text-slate-300">
            <p><span className="text-slate-500">Worker:</span> Maya Ellis</p>
            <p><span className="text-slate-500">Role:</span> Operations Lead</p>
            <p><span className="text-slate-500">Employer:</span> Greenwood Logistics</p>
            <p><span className="text-slate-500">Workspace:</span> Career OS + Pay</p>
          </div>
        </Card>

        <Card id="worker-support" title="Support and disputes">
          <form onSubmit={submitCase} className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} className="h-11 border border-white/10 bg-black px-3 text-white" /></label>
            <label className="grid gap-2 text-sm text-slate-300">What happened?<textarea value={detail} onChange={(event) => setDetail(event.target.value)} className="min-h-28 border border-white/10 bg-black p-3 text-white" /></label>
            <button className="h-11 bg-emerald-400 px-5 font-semibold text-black hover:bg-emerald-300">{saved ? "Case created" : "Open support case"}</button>
          </form>
        </Card>

        <Card title="Open cases">
          <div className="grid gap-3">
            {cases.length === 0 ? <p className="text-sm text-slate-400">No support cases are open.</p> : cases.map((item) => (
              <div key={item.id} className="border border-white/10 p-4">
                <div className="flex justify-between gap-4"><p className="font-semibold">{item.subject}</p><span className="text-sm text-emerald-200">{item.status}</span></div>
                <p className="mt-2 text-sm text-slate-400">{item.detail}</p>
                <p className="mt-3 text-xs text-slate-600">{item.id} · {item.createdAt}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}

export function EmployerWorkspacePage() {
  return (
    <Shell
      label="Employer Workspace"
      nav={
        <nav className="hidden gap-2 overflow-x-auto lg:flex" aria-label="Employer navigation">
          {employerNav.map((item) => <Link key={item.label} href={item.href} className="whitespace-nowrap border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-emerald-300/50 hover:text-white">{item.label}</Link>)}
        </nav>
      }
    >
      <section id="employer-overview" className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Greenwood Logistics</p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Employer operations</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">Manage your workforce and payroll workflow without exposing worker-only or internal SAIN operations.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[["Active workers", "4"], ["Prepared payroll", "2"], ["Corrections", "1"], ["Funding", "Not connected"]].map(([label, value]) => <div key={label} className="border border-white/10 bg-white/[0.025] p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></div>)}
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-10 sm:px-8 lg:grid-cols-2">
        <Card id="employer-workforce" title="Workforce"><div className="grid gap-3">{["Maya Ellis — Operations Lead", "Jordan Price — Field Technician", "Avery Chen — Payroll Specialist", "Noah Brooks — New hire"].map((item) => <div key={item} className="flex items-center gap-3 border border-white/10 p-4"><UsersRound className="h-5 w-5 text-emerald-300" />{item}</div>)}</div></Card>
        <Card id="employer-payroll" title="Payroll"><p className="text-sm leading-7 text-slate-300">Prepare payroll, review exceptions, and create correction events from this employer-owned surface.</p></Card>
        <Card id="employer-funding" title="Funding"><p className="text-sm leading-7 text-slate-300">No funding source is connected in this demo. Funding setup remains visible only to the employer.</p></Card>
        <Card id="employer-disbursements" title="Disbursements"><p className="text-sm leading-7 text-slate-300">Two sandbox disbursement records are prepared for review.</p></Card>
        <Card id="employer-corrections" title="Corrections"><p className="text-sm leading-7 text-slate-300">One payroll correction is open for Jordan Price.</p></Card>
        <Card id="employer-reports" title="Reports"><p className="text-sm leading-7 text-slate-300">Payroll history, workforce activity, and correction reporting belong here.</p></Card>
        <Card id="employer-settings" title="Settings"><div className="flex items-center gap-3 text-sm text-slate-300"><Building2 className="h-5 w-5 text-emerald-300" />Greenwood Logistics employer profile</div></Card>
      </div>
    </Shell>
  );
}
