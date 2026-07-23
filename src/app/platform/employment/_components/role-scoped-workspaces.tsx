"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  FileText,
  Headphones,
  Home,
  LogOut,
  UserRound,
  UsersRound,
} from "lucide-react";

type WorkerProfile = {
  career_profile_id: string;
  email: string;
  full_name: string;
  career_stage: string;
  current_role: string;
  location: string;
};

type WorkerMetrics = {
  total_applications: string;
  active_applications: string;
};

type WorkerTimelineEvent = {
  timeline_event_id: string;
  title: string;
  body: string | null;
  created_at: string;
};

type SupportCase = {
  support_case_id: string;
  subject: string;
  detail: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type WorkerWorkspaceResponse = {
  profile: WorkerProfile | null;
  metrics: WorkerMetrics | null;
  timeline: WorkerTimelineEvent[];
  supportCases: SupportCase[];
};

const workerNav = [
  { label: "Home", href: "#worker-home", icon: Home },
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
              <LogOut className="h-4 w-4" /> Exit
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
  const [email, setEmail] = useState("");
  const [workspace, setWorkspace] = useState<WorkerWorkspaceResponse | null>(null);
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("sain-career-email") || "";
    setEmail(savedEmail);
  }, []);

  async function loadWorkspace(candidateEmail: string) {
    const normalized = candidateEmail.trim().toLowerCase();
    if (!normalized) {
      setWorkspace(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/platform/worker?email=${encodeURIComponent(normalized)}`);
      const body = (await response.json()) as WorkerWorkspaceResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "WORKER_WORKSPACE_UNAVAILABLE");
      setWorkspace(body);
      window.localStorage.setItem("sain-career-email", normalized);
    } catch (requestError) {
      setWorkspace(null);
      setError(requestError instanceof Error ? requestError.message : "WORKER_WORKSPACE_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (email) void loadWorkspace(email);
  }, [email]);

  const openCases = useMemo(
    () => workspace?.supportCases.filter((item) => !["RESOLVED", "CLOSED"].includes(item.status)) ?? [],
    [workspace],
  );

  async function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace?.profile) return;

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/platform/worker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: workspace.profile.email,
          subject,
          detail,
        }),
      });
      const body = (await response.json()) as { supportCase?: SupportCase; error?: string };
      if (!response.ok || !body.supportCase) throw new Error(body.error || "WORKER_SUPPORT_CASE_FAILED");
      setWorkspace((current) => current ? { ...current, supportCases: [body.supportCase as SupportCase, ...current.supportCases] } : current);
      setSubject("");
      setDetail("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "WORKER_SUPPORT_CASE_FAILED");
    } finally {
      setSubmitting(false);
    }
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
          <div className="mt-4 max-w-3xl">
            <h1 className="text-4xl font-semibold sm:text-6xl">
              {workspace?.profile ? `Welcome back, ${workspace.profile.full_name}.` : "Connect your career profile."}
            </h1>
            <p className="mt-4 text-lg leading-8 text-slate-300">This workspace now shows persisted career, application, timeline, and support information.</p>
          </div>

          {!workspace?.profile && (
            <div className="mt-8 max-w-xl border border-white/10 bg-white/[0.025] p-5">
              <label className="grid gap-2 text-sm text-slate-300">
                Career profile email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 border border-white/10 bg-black px-3 text-white"
                  placeholder="you@example.com"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadWorkspace(email)}
                disabled={loading}
                className="mt-4 h-11 bg-emerald-400 px-5 font-semibold text-black disabled:opacity-60"
              >
                {loading ? "Loading..." : "Load workspace"}
              </button>
            </div>
          )}

          {error && <p className="mt-5 text-sm text-red-300">{error}</p>}

          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              ["Career stage", workspace?.profile?.career_stage || "No profile"],
              ["Total applications", workspace?.metrics?.total_applications || "0"],
              ["Active applications", workspace?.metrics?.active_applications || "0"],
              ["Open support cases", String(openCases.length)],
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
        <Card id="worker-activity" title="Activity">
          <div className="grid gap-3">
            {!workspace?.timeline.length ? (
              <p className="text-sm text-slate-400">No application activity is available.</p>
            ) : (
              workspace.timeline.map((item) => (
                <div key={item.timeline_event_id} className="border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-300">
                  <p className="font-semibold text-white">{item.title}</p>
                  {item.body && <p>{item.body}</p>}
                  <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card id="worker-documents" title="Documents">
          <p className="text-sm leading-7 text-slate-300">
            Resume files are stored with submitted applications. A dedicated worker-document repository is not connected to this workspace yet.
          </p>
        </Card>

        <Card id="worker-profile" title="Profile">
          {workspace?.profile ? (
            <div className="grid gap-3 text-sm text-slate-300">
              <p><span className="text-slate-500">Worker:</span> {workspace.profile.full_name}</p>
              <p><span className="text-slate-500">Email:</span> {workspace.profile.email}</p>
              <p><span className="text-slate-500">Current role:</span> {workspace.profile.current_role}</p>
              <p><span className="text-slate-500">Career stage:</span> {workspace.profile.career_stage}</p>
              <p><span className="text-slate-500">Location:</span> {workspace.profile.location}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No career profile is loaded.</p>
          )}
        </Card>

        <Card id="worker-support" title="Support and disputes">
          <form onSubmit={submitCase} className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              Subject
              <input required value={subject} onChange={(event) => setSubject(event.target.value)} className="h-11 border border-white/10 bg-black px-3 text-white" />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              What happened?
              <textarea required value={detail} onChange={(event) => setDetail(event.target.value)} className="min-h-28 border border-white/10 bg-black p-3 text-white" />
            </label>
            <button disabled={!workspace?.profile || submitting} className="h-11 bg-emerald-400 px-5 font-semibold text-black disabled:opacity-60">
              {submitting ? "Creating case..." : "Open support case"}
            </button>
          </form>
        </Card>

        <Card title="Support cases">
          <div className="grid gap-3">
            {!workspace?.supportCases.length ? <p className="text-sm text-slate-400">No support cases are recorded.</p> : workspace.supportCases.map((item) => (
              <div key={item.support_case_id} className="border border-white/10 p-4">
                <div className="flex justify-between gap-4"><p className="font-semibold">{item.subject}</p><span className="text-sm text-emerald-200">{item.status}</span></div>
                <p className="mt-2 text-sm text-slate-400">{item.detail}</p>
                <p className="mt-3 text-xs text-slate-600">{item.support_case_id} · {new Date(item.created_at).toLocaleString()}</p>
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
