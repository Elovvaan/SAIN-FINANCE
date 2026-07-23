"use client";

import { FormEvent, useState } from "react";

type Profile = {
  career_profile_id: string;
  email: string;
  full_name: string;
  career_stage: string;
  current_role: string;
  location: string;
};

type Job = {
  job_id: string;
  title: string;
  location: string;
  employment_type: string;
  description: string;
  company_name: string;
  industry: string;
};

type Application = {
  application_id: string;
  job_id: string;
  status: string;
  cover_note: string | null;
  resume_filename: string;
  resume_byte_length: number;
  submitted_at: string;
  title: string;
  company_name: string;
};

const inputClass = "w-full border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-300/60";

function friendlyError(value: string) {
  const labels: Record<string, string> = {
    APPLICATION_ALREADY_EXISTS: "You already applied to this job.",
    INVALID_RESUME_TYPE: "Resume must be a PDF, DOC, or DOCX file.",
    RESUME_TOO_LARGE: "Resume must be 10 MB or smaller.",
    CAREER_PROFILE_NOT_FOUND: "Save your career profile before applying.",
  };
  return labels[value] || value.replaceAll("_", " ").toLowerCase();
}

export function CareerWorkspace() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [careerStage, setCareerStage] = useState("Active worker");
  const [currentRole, setCurrentRole] = useState("");
  const [location, setLocation] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [coverNotes, setCoverNotes] = useState<Record<string, string>>({});
  const [resumeFiles, setResumeFiles] = useState<Record<string, File | null>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadWorkspace(targetEmail = email) {
    if (!targetEmail.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/platform/career?email=${encodeURIComponent(targetEmail.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load Career OS");
      setProfile(data.profile);
      setJobs(data.jobs || []);
      setApplications(data.applications || []);
      if (data.profile) {
        setEmail(data.profile.email);
        setFullName(data.profile.full_name);
        setCareerStage(data.profile.career_stage);
        setCurrentRole(data.profile.current_role);
        setLocation(data.profile.location);
        setMessage("Career workspace loaded.");
      } else {
        setMessage("No career profile exists for that email yet. Published jobs are ready to browse.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? friendlyError(error.message) : "Unable to load Career OS");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/career", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveProfile", email, fullName, careerStage, currentRole, location }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save career profile");
      setProfile(data.profile);
      setMessage("Career profile saved.");
      await loadWorkspace(data.profile.email);
    } catch (error) {
      setMessage(error instanceof Error ? friendlyError(error.message) : "Unable to save career profile");
      setLoading(false);
    }
  }

  async function apply(jobId: string) {
    const resume = resumeFiles[jobId];
    if (!resume) {
      setMessage("Select a resume before applying.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("email", email);
      form.set("jobId", jobId);
      form.set("coverNote", coverNotes[jobId] || "");
      form.set("resume", resume);
      const response = await fetch("/api/platform/career", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to submit application");
      setMessage("Application submitted.");
      setCoverNotes((current) => ({ ...current, [jobId]: "" }));
      setResumeFiles((current) => ({ ...current, [jobId]: null }));
      await loadWorkspace(email);
    } catch (error) {
      setMessage(error instanceof Error ? friendlyError(error.message) : "Unable to submit application");
      setLoading(false);
    }
  }

  async function withdraw(applicationId: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/career", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to withdraw application");
      setMessage("Application withdrawn.");
      await loadWorkspace(email);
    } catch (error) {
      setMessage(error instanceof Error ? friendlyError(error.message) : "Unable to withdraw application");
      setLoading(false);
    }
  }

  const applicationByJob = new Map(applications.map((item) => [item.job_id, item]));

  return (
    <main className="min-h-screen bg-[#020504] px-5 py-16 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Career OS</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Build your career record and apply to live jobs.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-400">
          Maintain one persistent worker-owned profile, submit applications with a real resume, track status, and withdraw when needed.
        </p>

        {message ? <div className="mt-8 border border-emerald-400/25 bg-emerald-400/[0.07] p-4 text-sm text-emerald-100">{message}</div> : null}

        <form onSubmit={saveProfile} className="mt-10 border border-white/10 bg-white/[0.025] p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div><h2 className="text-2xl font-semibold">Career profile</h2><p className="mt-2 text-sm text-slate-400">Save once, then reload it from any session with your email.</p></div>
            <button type="button" onClick={() => loadWorkspace()} disabled={loading} className="border border-white/15 px-4 py-3 text-sm font-semibold disabled:opacity-50">Load workspace</button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <input className={inputClass} type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <input className={inputClass} placeholder="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            <select className={inputClass} value={careerStage} onChange={(event) => setCareerStage(event.target.value)}>
              {["Active worker", "Exploring next role", "Recently hired", "Returning to work"].map((item) => <option key={item}>{item}</option>)}
            </select>
            <input className={inputClass} placeholder="Current role" value={currentRole} onChange={(event) => setCurrentRole(event.target.value)} required />
            <input className={inputClass} placeholder="Location" value={location} onChange={(event) => setLocation(event.target.value)} required />
            <button disabled={loading} className="bg-emerald-300 px-5 py-3 font-semibold text-black disabled:opacity-50">Save career profile</button>
          </div>
        </form>

        <section className="mt-10">
          <h2 className="text-3xl font-semibold">Published jobs</h2>
          <p className="mt-2 text-slate-400">{jobs.length} live opening{jobs.length === 1 ? "" : "s"}</p>
          <div className="mt-6 grid gap-5">
            {jobs.length === 0 ? <p className="border border-dashed border-white/10 p-6 text-slate-500">No published jobs are available.</p> : jobs.map((job) => {
              const application = applicationByJob.get(job.job_id);
              return (
                <article key={job.job_id} className="border border-white/10 bg-white/[0.025] p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row">
                    <div>
                      <h3 className="text-2xl font-semibold">{job.title}</h3>
                      <p className="mt-2 text-sm text-emerald-300">{job.company_name} · {job.industry}</p>
                      <p className="mt-2 text-sm text-slate-400">{job.location} · {job.employment_type}</p>
                      <p className="mt-4 max-w-4xl leading-7 text-slate-300">{job.description}</p>
                    </div>
                    {application ? <span className="h-fit border border-emerald-400/25 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{application.status}</span> : null}
                  </div>
                  {application ? (
                    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                      <span>Resume: {application.resume_filename}</span>
                      {application.status !== "WITHDRAWN" ? <button onClick={() => withdraw(application.application_id)} disabled={loading} className="border border-white/15 px-4 py-2 font-semibold text-white disabled:opacity-50">Withdraw application</button> : null}
                    </div>
                  ) : (
                    <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                      <textarea className={`${inputClass} min-h-28`} placeholder="Cover note (optional)" value={coverNotes[job.job_id] || ""} onChange={(event) => setCoverNotes((current) => ({ ...current, [job.job_id]: event.target.value }))} />
                      <label className="flex min-h-28 cursor-pointer items-center border border-dashed border-white/15 bg-black/30 px-4 text-sm text-slate-400">
                        <input className="hidden" type="file" accept=".pdf,.doc,.docx" onChange={(event) => setResumeFiles((current) => ({ ...current, [job.job_id]: event.target.files?.[0] || null }))} />
                        {resumeFiles[job.job_id]?.name || "Choose resume (PDF, DOC, DOCX)"}
                      </label>
                      <button type="button" onClick={() => apply(job.job_id)} disabled={loading || !profile} className="bg-emerald-300 px-5 py-3 font-semibold text-black disabled:opacity-40">Apply</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-10 border border-white/10 bg-white/[0.025] p-6">
          <h2 className="text-2xl font-semibold">My applications</h2>
          <div className="mt-6 grid gap-3">
            {applications.length === 0 ? <p className="text-slate-500">No applications submitted.</p> : applications.map((application) => (
              <div key={application.application_id} className="flex flex-col justify-between gap-3 border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center">
                <div><p className="font-semibold">{application.title}</p><p className="mt-1 text-sm text-slate-400">{application.company_name} · {application.resume_filename}</p></div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{application.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}