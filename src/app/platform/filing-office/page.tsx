"use client";

import { useEffect, useState } from "react";
import { Archive, Building2, FileCheck2, FileText, Landmark, RefreshCw, Send, ShieldCheck } from "lucide-react";

type Snapshot = {
  institution: { name: string; district: string; masterAccountStatus: string; prerequisites: Record<string, boolean> };
  packages: Array<{ id: string; type: string; status: string; completionPercentage: number; returnReason?: string }>;
  documents: Array<{ id: string; title: string; type: string; status: string; sourceVerificationRequired: boolean; versions: Array<{ version: number; checksum: string }> }>;
  submissions: Array<{ id: string; packageId: string; destination: string; status: string; submittedAt: string }>;
  auditCount: number;
};

const sections = [
  ["Packages", FileCheck2], ["Documents", FileText], ["Signatures", ShieldCheck], ["Submissions", Send],
  ["Institution", Landmark], ["Correspondence", Building2], ["Archive", Archive],
] as const;

export default function FilingOfficePage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/filing-office/snapshot", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load Filing Office");
      setSnapshot(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Filing Office");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main className="min-h-screen bg-[#020504] text-white">
      <header className="border-b border-white/10 bg-black/80 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div><p className="text-xs uppercase tracking-[0.3em] text-emerald-300">SAIN Finance</p><h1 className="mt-1 text-2xl font-semibold">Filing Office</h1></div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 hover:border-emerald-400/50"><RefreshCw className="h-4 w-4" />Refresh</button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[220px_1fr]">
        <aside className="border border-white/10 bg-white/[0.03] p-3">
          {sections.map(([label, Icon], index) => <button key={label} className={`mb-1 flex w-full items-center gap-3 px-3 py-3 text-left text-sm ${index === 0 ? "bg-emerald-400/10 text-emerald-300" : "text-slate-300 hover:bg-white/5"}`}><Icon className="h-4 w-4" />{label}</button>)}
        </aside>
        <section>
          {loading && <div className="border border-white/10 p-8 text-slate-400">Loading durable Filing Office records…</div>}
          {error && <div className="border border-red-400/30 bg-red-400/5 p-5 text-red-200">{error}</div>}
          {snapshot && <>
            <div className="grid gap-4 md:grid-cols-3">
              <Summary label="Institution" value={snapshot.institution.name} detail={snapshot.institution.district} />
              <Summary label="Master Account record" value={snapshot.institution.masterAccountStatus} detail="Institution-side only" />
              <Summary label="Audit events" value={String(snapshot.auditCount)} detail="Immutable operational history" />
            </div>
            <div className="mt-7 flex items-end justify-between"><div><p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Operational packages</p><h2 className="mt-2 text-2xl font-semibold">BIC and Filing Office workflow</h2></div></div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {snapshot.packages.length === 0 ? <Empty title="No packages created" text="Packages will appear after an authorized institution operator begins an operational workflow." /> : snapshot.packages.map((item) => <article key={item.id} className="border border-white/10 bg-white/[0.03] p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-emerald-300">{item.type.replaceAll("_", " ")}</p><h3 className="mt-2 text-xl font-semibold">{item.status.replaceAll("_", " ")}</h3></div><span className="text-2xl font-semibold">{item.completionPercentage}%</span></div><div className="mt-4 h-2 bg-white/10"><div className="h-full bg-emerald-400" style={{ width: `${item.completionPercentage}%` }} /></div>{item.returnReason && <p className="mt-4 text-sm text-amber-200">Returned: {item.returnReason}</p>}</article>)}
            </div>
            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <div><h2 className="text-lg font-semibold">Documents</h2><div className="mt-3 space-y-3">{snapshot.documents.length === 0 ? <Empty title="No documents" text="Generated, signed, verified, and submitted versions will appear here." /> : snapshot.documents.map((document) => <div key={document.id} className="border border-white/10 p-4"><div className="flex justify-between gap-4"><div><p className="font-medium">{document.title}</p><p className="mt-1 text-sm text-slate-400">{document.status} · Version {document.versions.at(-1)?.version ?? 0}</p></div>{document.sourceVerificationRequired && <span className="h-fit border border-amber-300/30 px-2 py-1 text-xs text-amber-200">SOURCE VERIFICATION REQUIRED</span>}</div></div>)}</div></div>
              <div><h2 className="text-lg font-semibold">Submission history</h2><div className="mt-3 space-y-3">{snapshot.submissions.length === 0 ? <Empty title="No external submissions recorded" text="The software never treats export as transmission. Submission must be explicitly recorded by an authorized operator." /> : snapshot.submissions.map((submission) => <div key={submission.id} className="border border-white/10 p-4"><p className="font-medium">{submission.status}</p><p className="mt-1 text-sm text-slate-400">{submission.destination}</p><p className="mt-2 text-xs text-slate-500">{new Date(submission.submittedAt).toLocaleString()}</p></div>)}</div></div>
            </div>
          </>}
        </section>
      </div>
    </main>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="border border-white/10 bg-white/[0.03] p-5"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p><p className="mt-3 text-xl font-semibold">{value}</p><p className="mt-2 text-sm text-slate-400">{detail}</p></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="border border-dashed border-white/15 p-6"><p className="font-medium">{title}</p><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></div>; }
