"use client";

import { FormEvent, useState } from "react";

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

const inputClass = "w-full border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-300/60";

export function EmployerWorkspace() {
  const [businessEmail, setBusinessEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("Logistics");
  const [companySize, setCompanySize] = useState("1-25 employees");
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("Full time");
  const [description, setDescription] = useState("");

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
      setEmployer(data.employer);
      setMessage("Employer workspace saved.");
      await loadWorkspace(data.employer.business_email);
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
        body: JSON.stringify({
          action: "createJob",
          businessEmail,
          title: jobTitle,
          location,
          employmentType,
          description,
          status,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create job");
      setJobTitle("");
      setLocation("");
      setDescription("");
      setMessage(status === "PUBLISHED" ? "Job published." : "Job saved as draft.");
      await loadWorkspace(businessEmail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create job");
      setLoading(false);
    }
  }

  async function changeStatus(jobId: string, status: "DRAFT" | "PUBLISHED" | "CLOSED") {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/employer", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update job");
      setMessage(`Job moved to ${status.toLowerCase()}.`);
      await loadWorkspace(businessEmail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update job");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020504] px-5 py-16 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Employer OS</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">Run your employer workspace.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-400">
          Create and maintain the company profile, publish jobs, and manage each opening from one persistent workspace.
        </p>

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
                {['Logistics', 'Manufacturing', 'Healthcare', 'Retail', 'Professional Services', 'Technology', 'Construction'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select className={inputClass} value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
                {['1-25 employees', '26-100 employees', '101-500 employees', '500+ employees'].map((item) => <option key={item}>{item}</option>)}
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
                {['Full time', 'Part time', 'Contract', 'Temporary'].map((item) => <option key={item}>{item}</option>)}
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
            <div>
              <h2 className="text-2xl font-semibold">Job openings</h2>
              <p className="mt-2 text-sm text-slate-400">{jobs.length} persistent record{jobs.length === 1 ? "" : "s"}</p>
            </div>
            {employer ? <span className="border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-400">{employer.verification_status}</span> : null}
          </div>
          <div className="mt-6 grid gap-4">
            {jobs.length === 0 ? <p className="border border-dashed border-white/10 p-6 text-slate-500">No jobs have been created for this employer.</p> : jobs.map((job) => (
              <article key={job.job_id} className="border border-white/10 bg-black/30 p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div>
                    <p className="text-xl font-semibold">{job.title}</p>
                    <p className="mt-2 text-sm text-slate-400">{job.location} · {job.employment_type}</p>
                    <p className="mt-4 max-w-3xl leading-7 text-slate-300">{job.description}</p>
                  </div>
                  <span className="h-fit border border-emerald-400/25 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{job.status}</span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {job.status !== 'PUBLISHED' ? <button onClick={() => changeStatus(job.job_id, 'PUBLISHED')} className="bg-emerald-300 px-4 py-2 text-sm font-semibold text-black">Publish</button> : null}
                  {job.status !== 'DRAFT' ? <button onClick={() => changeStatus(job.job_id, 'DRAFT')} className="border border-white/15 px-4 py-2 text-sm font-semibold">Move to draft</button> : null}
                  {job.status !== 'CLOSED' ? <button onClick={() => changeStatus(job.job_id, 'CLOSED')} className="border border-white/15 px-4 py-2 text-sm font-semibold">Close</button> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
