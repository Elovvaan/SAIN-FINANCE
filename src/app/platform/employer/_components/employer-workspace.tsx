"use client";

import { FormEvent, useMemo, useState } from "react";

type Employer = {
  employer_id: string;
  company_name: string;
  business_email: string;
  industry: string;
  company_size: string;
  verification_status: string;
};

type Job = {
  job_id: string;
  title: string;
  location: string;
  employment_type: string;
  description: string;
  status: string;
};

type Applicant = {
  application_id: string;
  job_id: string;
  job_title: string;
  status: string;
  shortlist_status: string;
  match_score: number;
  match_summary: string | null;
  cover_note: string | null;
  resume_filename: string;
  resume_media_type: string;
  resume_byte_length: number;
  submitted_at: string;
  full_name: string;
  email: string;
  career_stage: string;
  current_role: string;
  applicant_location: string;
};

const inputClass = "w-full border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-300/60";
const applicationStatuses = ["SUBMITTED", "IN_REVIEW", "INTERVIEW", "OFFERED", "REJECTED"] as const;
const shortlistStatuses = ["UNREVIEWED", "SHORTLISTED", "PASSED"] as const;

export function EmployerWorkspace() {
  const [businessEmail, setBusinessEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("Logistics");
  const [companySize, setCompanySize] = useState("1-25 employees");
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [applicantFilter, setApplicantFilter] = useState("ALL");
  const [shortlistFilter, setShortlistFilter] = useState("ALL");
  const [applicantSearch, setApplicantSearch] = useState("");

  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("Full time");
  const [description, setDescription] = useState("");

  const filteredApplicants = useMemo(() => {
    const query = applicantSearch.trim().toLowerCase();
    return applicants.filter((applicant) => {
      const statusMatch = applicantFilter === "ALL" || applicant.status === applicantFilter;
      const shortlistMatch = shortlistFilter === "ALL" || applicant.shortlist_status === shortlistFilter;
      const searchMatch = !query || [applicant.full_name, applicant.email, applicant.job_title, applicant.current_role, applicant.applicant_location, applicant.match_summary || ""]
        .some((value) => value.toLowerCase().includes(query));
      return statusMatch && shortlistMatch && searchMatch;
    });
  }, [applicants, applicantFilter, shortlistFilter, applicantSearch]);

  async function loadWorkspace(email = businessEmail) {
    if (!email.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/platform/employer?businessEmail=${encodeURIComponent(email.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load employer workspace");
      setEmployer(data.employer);
      setJobs(data.jobs || []);
      setApplicants(data.applicants || []);
      if (data.employer) {
        setCompanyName(data.employer.company_name);
        setBusinessEmail(data.employer.business_email);
        setIndustry(data.employer.industry);
        setCompanySize(data.employer.company_size);
        setMessage("Employer workspace loaded.");
      } else {
        setMessage("No employer workspace exists for that email yet.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load employer workspace");
    } finally {
      setLoading(false);
    }
  }

  async function saveEmployer(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/employer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveEmployer", companyName, businessEmail, industry, companySize }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save employer workspace");
      await loadWorkspace(data.employer.business_email);
      setMessage("Employer workspace saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save employer workspace");
      setLoading(false);
    }
  }

  async function createJob(event: FormEvent, status: "DRAFT" | "PUBLISHED") {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/employer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createJob", businessEmail, title: jobTitle, location, employmentType, description, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create job");
      setJobTitle("");
      setLocation("");
      setDescription("");
      await loadWorkspace(businessEmail);
      setMessage(status === "PUBLISHED" ? "Job published." : "Job saved as draft.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create job");
      setLoading(false);
    }
  }

  async function changeJobStatus(jobId: string, status: "DRAFT" | "PUBLISHED" | "CLOSED") {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/employer", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "updateJobStatus", businessEmail, jobId, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update job");
      await loadWorkspace(businessEmail);
      setMessage(`Job moved to ${status.toLowerCase()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update job");
      setLoading(false);
    }
  }

  async function changeApplicationStatus(applicationId: string, status: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/employer", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "updateApplicationStatus", businessEmail, applicationId, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update applicant");
      await loadWorkspace(businessEmail);
      setMessage(`Applicant moved to ${status.toLowerCase().replaceAll("_", " ")}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update applicant");
      setLoading(false);
    }
  }

  async function changeShortlistStatus(applicationId: string, shortlistStatus: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/employer", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "updateShortlistStatus", businessEmail, applicationId, shortlistStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update shortlist");
      await loadWorkspace(businessEmail);
      setMessage(`Shortlist moved to ${shortlistStatus.toLowerCase()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update shortlist");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020504] px-5 py-16 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Employer OS</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Run your employer workspace.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-400">Maintain the company profile, publish jobs, and review every real applicant from one persistent workspace.</p>

        {message ? <div className="mt-8 border border-emerald-400/25 bg-emerald-400/[0.07] p-4 text-sm text-emerald-100">{message}</div> : null}

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <form onSubmit={saveEmployer} className="border border-white/10 bg-white/[0.025] p-6">
            <h2 className="text-2xl font-semibold">Company profile</h2>
            <div className="mt-6 grid gap-4">
              <input className={inputClass} placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              <div className="flex gap-3">
                <input className={inputClass} type="email" placeholder="Business email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} required />
                <button type="button" onClick={() => loadWorkspace()} disabled={loading} className="border border-white/15 px-4 text-sm font-semibold hover:border-emerald-300/60 disabled:opacity-50">Load</button>
              </div>
              <select className={inputClass} value={industry} onChange={(e) => setIndustry(e.target.value)}>
                {["Logistics", "Manufacturing", "Healthcare", "Retail", "Professional Services", "Technology", "Construction"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select className={inputClass} value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
                {["1-25 employees", "26-100 employees", "101-500 employees", "500+ employees"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <button disabled={loading} className="bg-emerald-300 px-5 py-3 font-semibold text-black disabled:opacity-50">Save company profile</button>
            </div>
          </form>

          <form onSubmit={(event) => createJob(event, "DRAFT")} className="border border-white/10 bg-white/[0.025] p-6">
            <h2 className="text-2xl font-semibold">Create a job</h2>
            <p className="mt-2 text-sm text-slate-400">Save a draft or publish it immediately.</p>
            <div className="mt-6 grid gap-4">
              <input className={inputClass} placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required />
              <input className={inputClass} placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} required />
              <select className={inputClass} value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                {["Full time", "Part time", "Contract", "Temporary"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <textarea className={`${inputClass} min-h-36`} placeholder="Job description" value={description} onChange={(e) => setDescription(e.target.value)} required />
              <div className="grid gap-3 sm:grid-cols-2">
                <button disabled={loading || !employer} className="border border-white/15 px-5 py-3 font-semibold disabled:opacity-40">Save draft</button>
                <button type="button" onClick={(event) => createJob(event as unknown as FormEvent, "PUBLISHED")} disabled={loading || !employer} className="bg-emerald-300 px-5 py-3 font-semibold text-black disabled:opacity-40">Publish job</button>
              </div>
            </div>
          </form>
        </div>

        <section className="mt-10 border border-white/10 bg-white/[0.025] p-6">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="text-2xl font-semibold">Job openings</h2><p className="mt-2 text-sm text-slate-400">{jobs.length} persistent record{jobs.length === 1 ? "" : "s"}</p></div>
            {employer ? <span className="border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-400">{employer.verification_status}</span> : null}
          </div>
          <div className="mt-6 grid gap-4">
            {jobs.length === 0 ? <p className="border border-dashed border-white/10 p-6 text-slate-500">No jobs have been created for this employer.</p> : jobs.map((job) => (
              <article key={job.job_id} className="border border-white/10 bg-black/30 p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div><p className="text-xl font-semibold">{job.title}</p><p className="mt-2 text-sm text-slate-400">{job.location} · {job.employment_type}</p><p className="mt-4 max-w-3xl leading-7 text-slate-300">{job.description}</p></div>
                  <span className="h-fit border border-emerald-400/25 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{job.status}</span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {job.status !== "PUBLISHED" ? <button onClick={() => changeJobStatus(job.job_id, "PUBLISHED")} className="bg-emerald-300 px-4 py-2 text-sm font-semibold text-black">Publish</button> : null}
                  {job.status !== "DRAFT" ? <button onClick={() => changeJobStatus(job.job_id, "DRAFT")} className="border border-white/15 px-4 py-2 text-sm font-semibold">Move to draft</button> : null}
                  {job.status !== "CLOSED" ? <button onClick={() => changeJobStatus(job.job_id, "CLOSED")} className="border border-white/15 px-4 py-2 text-sm font-semibold">Close</button> : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 border border-white/10 bg-white/[0.025] p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div><h2 className="text-2xl font-semibold">Applicants</h2><p className="mt-2 text-sm text-slate-400">{applicants.length} application{applicants.length === 1 ? "" : "s"} connected directly to your published jobs.</p></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input className={inputClass} placeholder="Search name, email, job, role" value={applicantSearch} onChange={(event) => setApplicantSearch(event.target.value)} />
              <select className={inputClass} value={applicantFilter} onChange={(event) => setApplicantFilter(event.target.value)}>
                <option value="ALL">All statuses</option>
                {[...applicationStatuses, "WITHDRAWN"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
              <select className={inputClass} value={shortlistFilter} onChange={(event) => setShortlistFilter(event.target.value)}>
                <option value="ALL">All shortlist stages</option>
                {shortlistStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            {filteredApplicants.length === 0 ? <p className="border border-dashed border-white/10 p-6 text-slate-500">No applicants match the current filters.</p> : filteredApplicants.map((applicant) => (
              <article key={applicant.application_id} className="border border-white/10 bg-black/30 p-5">
                <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-xl font-semibold">{applicant.full_name}</p>
                      <span className="border border-white/10 px-2 py-1 text-xs uppercase tracking-[0.14em] text-slate-400">{applicant.status.replaceAll("_", " ")}</span>
                      <span className={`border px-2 py-1 text-xs uppercase tracking-[0.14em] ${applicant.shortlist_status === "SHORTLISTED" ? "border-amber-300/40 text-amber-200" : "border-white/10 text-slate-400"}`}>{applicant.shortlist_status}</span>
                      <span className="border border-cyan-300/30 px-2 py-1 text-xs uppercase tracking-[0.14em] text-cyan-200">Match {applicant.match_score ?? 0}%</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{applicant.email} · {applicant.applicant_location}</p>
                    <p className="mt-2 text-sm text-emerald-200">Applied for {applicant.job_title}</p>
                    <p className="mt-4 text-sm leading-6 text-slate-300">Current role: {applicant.current_role} · Career stage: {applicant.career_stage}</p>
                    {applicant.match_summary ? <p className="mt-4 border-l border-cyan-300/40 pl-4 text-sm leading-6 text-slate-300">{applicant.match_summary}</p> : null}
                    {applicant.cover_note ? <p className="mt-4 border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-300">{applicant.cover_note}</p> : null}
                    <p className="mt-4 text-xs text-slate-500">Resume: {applicant.resume_filename} · {Math.max(1, Math.round(applicant.resume_byte_length / 1024))} KB · Submitted {new Date(applicant.submitted_at).toLocaleString()}</p>
                  </div>
                  <div className="grid h-fit gap-3">
                    <select className={inputClass} value={applicant.shortlist_status} onChange={(event) => changeShortlistStatus(applicant.application_id, event.target.value)} disabled={loading || applicant.status === "WITHDRAWN"}>
                      {shortlistStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    {applicant.status === "WITHDRAWN" ? <span className="border border-white/10 px-3 py-2 text-sm text-slate-500">Withdrawn by applicant</span> : (
                      <select className={inputClass} value={applicant.status} onChange={(event) => changeApplicationStatus(applicant.application_id, event.target.value)} disabled={loading}>
                        {applicationStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                      </select>
                    )}
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
