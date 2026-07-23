"use client";

import { FormEvent, useMemo, useState } from "react";

type Interview = {
  interview_id: string;
  application_id: string;
  stage: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  format: string;
  location: string | null;
  meeting_url: string | null;
  interviewer_name: string | null;
  notes: string | null;
  job_title: string;
  job_location: string;
  company_name: string;
  full_name: string;
  candidate_email: string;
};

const inputClass = "w-full border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-300/60";
const stages = ["INITIAL", "SCREENING", "TECHNICAL", "PANEL", "FINAL"];
const statuses = ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
const formats = ["VIRTUAL", "PHONE", "IN_PERSON"];

export function InterviewWorkspace() {
  const [workspace, setWorkspace] = useState("EMPLOYER");
  const [identifier, setIdentifier] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [stage, setStage] = useState("INITIAL");
  const [status, setStatus] = useState("SCHEDULED");
  const [format, setFormat] = useState("VIRTUAL");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [notes, setNotes] = useState("");
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const visibleInterviews = useMemo(
    () => interviews.filter((interview) => filter === "ALL" || interview.status === filter),
    [interviews, filter],
  );

  async function loadInterviews() {
    if (!identifier.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ workspace, identifier: identifier.trim() });
      if (applicationId.trim()) params.set("applicationId", applicationId.trim());
      const response = await fetch(`/api/platform/interviews?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load interviews");
      setInterviews(data.interviews || []);
      setMessage("Interview schedule loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load interviews");
    } finally {
      setLoading(false);
    }
  }

  async function scheduleInterview(event: FormEvent) {
    event.preventDefault();
    if (workspace === "CAREER") return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/interviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace,
          identifier,
          applicationId,
          stage,
          status,
          format,
          scheduledAt,
          durationMinutes: Number(durationMinutes),
          location,
          meetingUrl,
          interviewerName,
          notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to schedule interview");
      setMessage("Interview scheduled.");
      await loadInterviews();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to schedule interview");
      setLoading(false);
    }
  }

  async function changeStatus(interviewId: string, nextStatus: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/interviews", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace, identifier, interviewId, status: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update interview");
      setMessage(`Interview moved to ${nextStatus.toLowerCase().replaceAll("_", " ")}.`);
      await loadInterviews();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update interview");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020504] px-5 py-16 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Interview Scheduling</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Coordinate every interview.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-400">Schedule, confirm, complete, cancel, and review interviews across Employer OS, Staffing OS, and Career OS.</p>

        {message ? <div className="mt-8 border border-emerald-400/25 bg-emerald-400/[0.07] p-4 text-sm text-emerald-100">{message}</div> : null}

        <section className="mt-10 border border-white/10 bg-white/[0.025] p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <select className={inputClass} value={workspace} onChange={(event) => setWorkspace(event.target.value)}>
              <option value="EMPLOYER">Employer OS</option>
              <option value="STAFFING">Staffing OS</option>
              <option value="CAREER">Career OS</option>
            </select>
            <input className={inputClass} type="email" placeholder="Workspace email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
            <div className="flex gap-2">
              <input className={inputClass} placeholder="Application ID (optional filter)" value={applicationId} onChange={(event) => setApplicationId(event.target.value)} />
              <button type="button" onClick={loadInterviews} disabled={loading || !identifier.trim()} className="border border-white/15 px-5 font-semibold disabled:opacity-40">Load</button>
            </div>
          </div>
        </section>

        {workspace !== "CAREER" ? (
          <form onSubmit={scheduleInterview} className="mt-8 border border-white/10 bg-white/[0.025] p-6">
            <h2 className="text-2xl font-semibold">Schedule interview</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <input className={inputClass} placeholder="Application ID" value={applicationId} onChange={(event) => setApplicationId(event.target.value)} required />
              <select className={inputClass} value={stage} onChange={(event) => setStage(event.target.value)}>{stages.map((item) => <option key={item}>{item}</option>)}</select>
              <select className={inputClass} value={format} onChange={(event) => setFormat(event.target.value)}>{formats.map((item) => <option key={item}>{item}</option>)}</select>
              <input className={inputClass} type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />
              <input className={inputClass} type="number" min="5" max="480" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required />
              <input className={inputClass} placeholder="Interviewer name" value={interviewerName} onChange={(event) => setInterviewerName(event.target.value)} />
              <input className={inputClass} placeholder="Location" value={location} onChange={(event) => setLocation(event.target.value)} />
              <input className={inputClass} type="url" placeholder="Meeting URL" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} />
              <textarea className={`${inputClass} min-h-28 md:col-span-2 xl:col-span-3`} placeholder="Interview notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              <button disabled={loading || !identifier.trim()} className="bg-emerald-300 px-5 py-3 font-semibold text-black disabled:opacity-40">Schedule interview</button>
            </div>
          </form>
        ) : null}

        <section className="mt-8 border border-white/10 bg-white/[0.025] p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><h2 className="text-2xl font-semibold">Interview calendar</h2><p className="mt-2 text-sm text-slate-400">{visibleInterviews.length} interview record{visibleInterviews.length === 1 ? "" : "s"}</p></div>
            <select className={`${inputClass} sm:max-w-64`} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
          </div>
          <div className="mt-6 grid gap-4">
            {visibleInterviews.length === 0 ? <p className="border border-dashed border-white/10 p-6 text-slate-500">No interviews match this view.</p> : visibleInterviews.map((interview) => (
              <article key={interview.interview_id} className="border border-white/10 bg-black/30 p-5">
                <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-semibold">{interview.full_name}</h3><span className="border border-emerald-400/25 px-2 py-1 text-xs uppercase tracking-[0.14em] text-emerald-300">{interview.stage}</span><span className="border border-white/10 px-2 py-1 text-xs uppercase tracking-[0.14em] text-slate-300">{interview.status.replaceAll("_", " ")}</span></div>
                    <p className="mt-2 text-sm text-slate-400">{interview.candidate_email} · {interview.company_name} · {interview.job_title}</p>
                    <p className="mt-4 text-base text-white">{new Date(interview.scheduled_at).toLocaleString()} · {interview.duration_minutes} minutes · {interview.format.replaceAll("_", " ")}</p>
                    {interview.location ? <p className="mt-2 text-sm text-slate-400">Location: {interview.location}</p> : null}
                    {interview.meeting_url ? <a className="mt-2 block text-sm text-cyan-300 underline" href={interview.meeting_url} target="_blank" rel="noreferrer">Open meeting link</a> : null}
                    {interview.interviewer_name ? <p className="mt-2 text-sm text-slate-400">Interviewer: {interview.interviewer_name}</p> : null}
                    {interview.notes ? <p className="mt-4 border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-300">{interview.notes}</p> : null}
                  </div>
                  <select className={`${inputClass} h-fit min-w-52`} value={interview.status} onChange={(event) => changeStatus(interview.interview_id, event.target.value)} disabled={loading}>
                    {(workspace === "CAREER" ? [interview.status, "CONFIRMED"] : statuses).filter((item, index, list) => list.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
