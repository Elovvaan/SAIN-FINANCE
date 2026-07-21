"use client";

import { useEffect, useState } from "react";
import { FileText, Handshake, Landmark, WalletCards } from "lucide-react";

type RelationshipSnapshot = {
  relationship: { name: string };
  opportunities: Array<{ title: string; status: string }>;
  documents: Array<{ title: string; type: string; status: string }>;
};

export default function RelationshipPage() {
  const [snapshot, setSnapshot] = useState<RelationshipSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/filing-office/snapshot?view=relationship", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load relationship");
        return body;
      })
      .then(setSnapshot)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load relationship"));
  }, []);

  const sections = [
    ["Funds", "Deposit instructions and relationship-rooted balances", WalletCards],
    ["Agreements", "Terms and authorities governing this relationship", Handshake],
    ["Filing Office", "Member-side documents and packages only", FileText],
    ["Institutional separation", "Master Account, OC-10, and BIC records are not exposed here", Landmark],
  ] as const;

  return <main className="min-h-screen bg-[#020504] px-6 py-10 text-white"><div className="mx-auto max-w-6xl"><p className="text-xs uppercase tracking-[0.3em] text-emerald-300">SAIN Finance</p><h1 className="mt-3 text-4xl font-semibold">{snapshot?.relationship.name || "Relationship Workspace"}</h1><p className="mt-3 max-w-2xl text-slate-400">The relationship is presented through authenticated identity, agreements, authorities, operations, opportunities, and records—not as a permanent public account number.</p>{error && <div className="mt-6 border border-red-400/30 bg-red-400/5 p-4 text-red-200">{error}</div>}<div className="mt-10 grid gap-4 md:grid-cols-2">{sections.map(([title, detail, Icon]) => <article key={title} className="border border-white/10 bg-white/[0.03] p-6"><Icon className="h-5 w-5 text-emerald-300" /><h2 className="mt-4 text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p></article>)}</div><section className="mt-10"><p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Opportunities</p><h2 className="mt-2 text-2xl font-semibold">Available relationship actions</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{snapshot?.opportunities.map((item) => <div key={item.title} className="border border-white/10 p-5"><p className="font-medium">{item.title}</p><p className="mt-2 text-sm text-slate-400">{item.status.replaceAll("_", " ")}</p></div>)}</div></section></div></main>;
}
