import Link from "next/link";
import { ArrowRight, FileCheck2, Landmark, ShieldCheck } from "lucide-react";

export default function InstitutionPage() {
  const records = [
    ["Reserve Bank Relationship", "12th District administrative relationship file"],
    ["Master Account Record", "Single institution-side record; never member-owned"],
    ["OC-10", "Letter of Agreement, borrowing resolutions, and authorization lists"],
    ["BIC Program", "Application, collateral operations, inspections, and annual requirements"],
  ];

  return <main className="min-h-screen bg-[#020504] px-6 py-10 text-white"><div className="mx-auto max-w-6xl"><p className="text-xs uppercase tracking-[0.3em] text-emerald-300">SAIN Finance</p><div className="mt-3 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><h1 className="text-4xl font-semibold">Institution Administration</h1><p className="mt-3 max-w-2xl text-slate-400">Institutional agreements, authorities, Reserve Bank records, and BIC operations remain isolated from member relationships.</p></div><Link href="/platform/filing-office" className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 font-semibold text-black">Open Filing Office<ArrowRight className="h-4 w-4" /></Link></div><div className="mt-10 grid gap-4 md:grid-cols-2">{records.map(([title, detail], index) => <article key={title} className="border border-white/10 bg-white/[0.03] p-6">{index === 0 ? <Landmark className="h-5 w-5 text-emerald-300" /> : index === 3 ? <FileCheck2 className="h-5 w-5 text-emerald-300" /> : <ShieldCheck className="h-5 w-5 text-emerald-300" />}<h2 className="mt-4 text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p></article>)}</div><div className="mt-8 border border-amber-300/20 bg-amber-300/5 p-5 text-sm leading-6 text-amber-100">This workspace records preparation and operational status only. It does not represent an established Federal Reserve relationship, active Master Account, Discount Window access, BIC enrollment, custody arrangement, or live money movement.</div></div></main>;
}
