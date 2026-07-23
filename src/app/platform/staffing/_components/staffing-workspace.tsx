"use client";

import { FormEvent, useMemo, useState } from "react";

type StaffingProfile = {
  staffing_profile_id: string;
  agency_name: string;
  business_email: string;
  recruiter_count: string;
  locations: string;
};

type Candidate = {
  application_id: string;
  application_status: string;
  cover_note: string | null;
  resume_filename: string;
  submitted_at: string;
  match_score: number;
  match_summary: string | null;
  full_name: string;
  email: string;
  current_role: string;
  location: string;
  job_id: string;
  title: string;
  job_location: string;
  company_name: string;
  staffing_assignment_id: string | null;
  recruiter_note: string | null;
  placement_status: string | null;
};

const inputClass = "w-full border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-300/60";
const placementStatuses = ["NEW", "MATCHED", "SCREENING", "SUBMITTED", "INTERVIEW", "OFFERED", "PLACED", "CLOSED"];

export function StaffingWorkspace() {
  const [agencyName, setAgencyName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [recruiterCount, setRecruiterCount] = useState("1-5 recruiters");
  const [locations, setLocations] = useState("");
  const [profile, setProfile] = useState<StaffingProfile | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [matchScores, setMatchScores] = useState<Record<string, string>>({});
  const [matchSummaries, setMatchSummaries] = useState<Record<string, string>>({});

  async function loadWorkspace(email = businessEmail) {
    if (!email.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/platform/staffing?businessEmail=${encodeURIComponent(email.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load Staffing OS");
      setProfile(data.profile);
      setCandidates(data.candidates || []);
      if (data.profile) {
        setAgencyName(data.profile.agency_name);
        setBusinessEmail(data.profile.business_email);
        setRecruiterCount(data.profile.recruiter_count);
        setLocations(data.profile.locations);
        setMessage("Staffing workspace loaded.");
      } else {
        setMessage("No staffing workspace exists for that email yet.");
      }
      const nextNotes: Record<string, string> = {};
      const nextStatuses: Record<string, string> = {};
      const nextMatchScores: Record<string, string> = {};
      const nextMatchSummaries: Record<string, string> = {};
      for (const candidate of data.candidates || []) {
        nextNotes[candidate.application_id] = candidate.recruiter_note || "";
        nextStatuses[candidate.application_id] = candidate.placement_status || "NEW";
        nextMatchScores[candidate.application_id] = String(candidate.match_score ?? 0);
        nextMatchSummaries[candidate.application_id] = candidate.match_summary || "";
      }
      setNotes(nextNotes);
      setStatuses(nextStatuses);
      setMatchScores(nextMatchScores);
      setMatchSummaries(nextMatchSummaries);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Staffing OS");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/staffing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveProfile", agencyName, businessEmail, recruiterCount, locations }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save staffing profile");
      setProfile(data.profile);
      await loadWorkspace(data.profile.business_email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save staffing profile");
      setLoading(false);
    }
  }

  async function saveCandidate(candidate: Candidate) {
    if (!profile) return;
    setLoading(true);
    setMessage("");
    try {
      const payload = {
        businessEmail,
        applicationId: candidate.application_id,
        recruiterNote: notes[candidate.application_id] || "",
        placementStatus: statuses[candidate.application_id] || "NEW",
      };
      const response = await fetch("/api/platform/staffing", {
        method: candidate.staffing_assignment_id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(candidate.staffing_assignment_id
          ? { assignmentId: candidate.staffing_assignment_id, recruiterNote: payload.recruiterNote, placementStatus: payload.placementStatus }
          : { action: "assignCandidate", ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update candidate pipeline");
      setMessage("Candidate pipeline updated.");
      await loadWorkspace(businessEmail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update candidate pipeline");
      setLoading(false);
    }
  }

  async function saveMatch(candidate: Candidate) {
    if (!profile) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/staffing", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updateMatchScore",
          businessEmail,
          applicationId: candidate.application_id,
          matchScore: Number(matchScores[candidate.application_id] ?? 0),
          matchSummary: matchSummaries[candidate.application_id] || "",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update candidate match score");
      setMessage("Candidate match score updated.");
      await loadWorkspace(businessEmail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update candidate match score");
      setLoading(false);
    }
  }

  const filteredCandidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const placement = candidate.placement_status || "NEW";
      const matchesStatus = statusFilter === "ALL" || placement === statusFilter;
      const haystack = [candidate.full_name, candidate.email, candidate.current_role, candidate.location, candidate.title, candidate.company_name, candidate.job_location, candidate.match_summary || ""]
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [candidates, query, statusFilter]);

  return (
    <main className="min-h-screen bg-[#020504] px-5 py-16 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Staffing OS</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Run your staffing pipeline.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-400">Manage recruiter operations, review Career OS applicants, score candidate fit, add notes, and move candidates through a persistent placement workflow.</p>

        {message ? <div className="mt-8 border border-emerald-400/25 bg-emerald-400/[0.07] p-4 text-sm text-emerald-100">{message}</div> : null}

        <form onSubmit={saveProfile} className="mt-10 border border-white/10 bg-white/[0.025] p-6">
          <h2 className="text-2xl font-semibold">Agency profile</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <input className={inputClass} placeholder="Agency name" value={agencyName} onChange={(event) => setAgencyName(event.target.value)} required />
            <div className="flex gap-2 lg:col-span-1">
              <input className={inputClass} type="email" placeholder="Business email" value={businessEmail} onChange={(event) => setBusinessEmail(event.target.value)} required />
              <button type="button" onClick={() => loadWorkspace()} disabled={loading} className="border border-white/15 px-4 text-sm font-semibold disabled:opacity-50">Load</button>
            </div>
            <select className={inputClass} value={recruiterCount} onChange={(event) => setRecruiterCount(event.target.value)}>
              {["1-5 recruiters", "6-20 recruiters", "21-50 recruiters", "50+ recruiters"].map((item) => <option key={item}>{item}</option>)}
            </select>
            <input className={inputClass} placeholder="Locations" value={locations} onChange={(event) => setLocations(event.target.value)} required />
          </div>
          <button disabled={loading} className="mt-4 bg-emerald-300 px-5 py-3 font-semibold text-black disabled:opacity-50">Save staffing profile</button>
        </form>

        <section className="mt-10 border border-white/10 bg-white/[0.025] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Candidate queue</h2>
              <p className="mt-2 text-sm text-slate-400">{filteredCandidates.length} candidate record{filteredCandidates.length === 1 ? "" : "s"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[520px]">
              <input className={inputClass} placeholder="Search candidate, job, employer, location, or match summary" value={query} onChange={(event) => setQuery(event.target.value)} />
              <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="ALL">All placement statuses</option>
                {placementStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {filteredCandidates.length === 0 ? <p className="border border-dashed border-white/10 p-6 text-slate-500">No candidates match this view.</p> : filteredCandidates.map((candidate) => (
              <article key={candidate.application_id} className="border border-white/10 bg-black/30 p-5">
                <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
                  <div>
                    <div className="flex flex-col justify-between gap-3 sm:flex-row">
                      <div>
                        <h3 className="text-xl font-semibold">{candidate.full_name}</h3>
                        <p className="mt-1 text-sm text-slate-400">{candidate.email} · {candidate.current_role} · {candidate.location}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-fit border border-cyan-400/25 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Match {candidate.match_score ?? 0}%</span>
                        <span className="h-fit border border-emerald-400/25 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{candidate.placement_status || "NEW"}</span>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="border border-white/10 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Applied role</p>
                        <p className="mt-2 font-semibold">{candidate.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{candidate.company_name} · {candidate.job_location}</p>
                      </div>
                      <div className="border border-white/10 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Application</p>
                        <p className="mt-2 font-semibold">{candidate.application_status}</p>
                        <p className="mt-1 text-sm text-slate-400">Resume: {candidate.resume_filename}</p>
                      </div>
                    </div>
                    {candidate.match_summary ? <p className="mt-4 border-l border-cyan-300/40 pl-4 text-sm leading-7 text-slate-300">{candidate.match_summary}</p> : null}
                    {candidate.cover_note ? <p className="mt-4 border-l border-emerald-300/40 pl-4 text-sm leading-7 text-slate-300">{candidate.cover_note}</p> : null}
                  </div>

                  <div className="grid gap-3">
                    <div className="border border-white/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Candidate match</p>
                      <input className={`${inputClass} mt-3`} type="number" min="0" max="100" value={matchScores[candidate.application_id] ?? String(candidate.match_score ?? 0)} onChange={(event) => setMatchScores((current) => ({ ...current, [candidate.application_id]: event.target.value }))} />
                      <textarea className={`${inputClass} mt-3 min-h-24`} placeholder="Why this candidate matches the role" value={matchSummaries[candidate.application_id] ?? candidate.match_summary ?? ""} onChange={(event) => setMatchSummaries((current) => ({ ...current, [candidate.application_id]: event.target.value }))} />
                      <button onClick={() => saveMatch(candidate)} disabled={loading || !profile} className="mt-3 w-full border border-cyan-300/40 px-5 py-3 font-semibold text-cyan-200 disabled:opacity-40">Save match score</button>
                    </div>
                    <select className={inputClass} value={statuses[candidate.application_id] || candidate.placement_status || "NEW"} onChange={(event) => setStatuses((current) => ({ ...current, [candidate.application_id]: event.target.value }))}>
                      {placementStatuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                    <textarea className={`${inputClass} min-h-32`} placeholder="Recruiter notes" value={notes[candidate.application_id] ?? candidate.recruiter_note ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [candidate.application_id]: event.target.value }))} />
                    <button onClick={() => saveCandidate(candidate)} disabled={loading || !profile} className="bg-emerald-300 px-5 py-3 font-semibold text-black disabled:opacity-40">Save pipeline update</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
