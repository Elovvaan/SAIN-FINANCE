"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Camera,
  CheckCircle2,
  Code2,
  Compass,
  FileText,
  FolderOpen,
  GraduationCap,
  Hammer,
  HeartPulse,
  IdCard,
  Lightbulb,
  PlaySquare,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  UserCheck,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const workSources = [
  { label: "Employer", icon: Building2, active: true },
  { label: "Staffing Agency", icon: BriefcaseBusiness, active: true },
  { label: "Independent Contractor", icon: Wrench, active: false },
  { label: "Self Employment", icon: Store, active: false },
  { label: "Content Creator", icon: Camera, active: false },
  { label: "Software Developer", icon: Code2, active: false },
  { label: "Consultant", icon: Compass, active: false },
  { label: "Freelancer", icon: Hammer, active: false },
  { label: "Small Business", icon: Store, active: false },
  { label: "Local Services", icon: UserCheck, active: false },
  { label: "Future Categories", icon: Plus, active: false },
] as const;

const projects = [
  {
    name: "Denver cold-chain dock reset",
    client: "Greenwood Logistics",
    date: "May 2026",
    skills: ["Team leadership", "Safety training", "Route coordination"],
    status: "Completed",
    evidence: "3 photos, 1 MP4, supervisor note",
    lesson: "Document process changes while the work is fresh.",
  },
  {
    name: "Forklift safety demonstration",
    client: "Mountain Freight",
    date: "March 2026",
    skills: ["Forklift", "OSHA awareness", "Training"],
    status: "Needs evidence",
    evidence: "Add video or certificate",
    lesson: "Turn repeatable work into reusable proof.",
  },
  {
    name: "Inventory correction workflow",
    client: "Northline Warehouse",
    date: "January 2026",
    skills: ["Customer service", "Operations", "Documentation"],
    status: "In review",
    evidence: "PDF summary, reference request",
    lesson: "Operational fixes can become portfolio projects.",
  },
];

const evidenceVault = [
  { title: "Forklift operation demo", date: "Jun 2026", status: "Private", type: "MP4", preview: "Video clip", sharing: "Share by permission" },
  { title: "OSHA safety card", date: "Apr 2026", status: "Verified", type: "Certificate", preview: "Card image", sharing: "Employer visible" },
  { title: "Driver license copy", date: "Mar 2026", status: "Protected", type: "License", preview: "Restricted document", sharing: "Permission required" },
  { title: "Operations resume draft", date: "Jun 2026", status: "Draft", type: "PDF", preview: "Two-page resume", sharing: "Worker controlled" },
  { title: "Supervisor reference", date: "May 2026", status: "Requested", type: "Reference", preview: "Pending response", sharing: "Not shared yet" },
  { title: "Portfolio snapshot", date: "Jun 2026", status: "Ready", type: "Portfolio", preview: "Project bundle", sharing: "Share link mock" },
];

const skills = [
  { name: "Forklift", evidence: "MP4 + OSHA card", verified: true, updated: "Jun 2026", cert: "OSHA card", notes: "Add updated demonstration before renewal." },
  { name: "Customer Service", evidence: "Reference attached", verified: true, updated: "May 2026", cert: "None", notes: "Strong fit for front-line operations." },
  { name: "Python", evidence: "Portfolio file", verified: false, updated: "Apr 2026", cert: "Pending", notes: "Attach project walkthrough." },
  { name: "Electrical", evidence: "Training record", verified: false, updated: "Feb 2026", cert: "Training", notes: "Clarify supervised work only." },
  { name: "CPR", evidence: "Certificate", verified: true, updated: "Jan 2026", cert: "CPR", notes: "Track expiration date." },
  { name: "AI Prompting", evidence: "Work examples", verified: false, updated: "Jun 2026", cert: "None", notes: "Add before-and-after examples." },
  { name: "Video Editing", evidence: "MP4 portfolio", verified: false, updated: "May 2026", cert: "None", notes: "Useful for creator work source." },
  { name: "Sales", evidence: "Client note", verified: false, updated: "Mar 2026", cert: "None", notes: "Request a reference." },
];

const timeline = [
  { type: "Job", title: "Operations Lead", source: "Greenwood Logistics", date: "Current", note: "Leadership role strengthened with project evidence." },
  { type: "Project", title: "Cold-chain dock reset", source: "Greenwood Logistics", date: "May 2026", note: "Completed project with photos, MP4, and lessons learned." },
  { type: "Certification", title: "OSHA safety card", source: "Training provider", date: "Apr 2026", note: "Certification stored in Evidence Vault." },
  { type: "Training", title: "Forklift demonstration", source: "Mountain Freight", date: "Mar 2026", note: "Needs updated evidence before renewal window." },
  { type: "Business Launch", title: "Weekend local services profile", source: "Self employment", date: "Feb 2026", note: "Early small-business milestone captured." },
  { type: "Content Creation", title: "Safety walkthrough video", source: "Creator portfolio", date: "Jan 2026", note: "Professional content organized as worker-owned proof." },
  { type: "Volunteer Work", title: "Community warehouse drive", source: "Local nonprofit", date: "Dec 2025", note: "Reference request available." },
];

const healthItems = [
  { label: "Documents Complete", value: 78 },
  { label: "Skills Verified", value: 50 },
  { label: "Evidence Uploaded", value: 64 },
  { label: "References Added", value: 40 },
  { label: "Projects Documented", value: 70 },
  { label: "Timeline Complete", value: 82 },
];

const aiSuggestions = [
  "Your OSHA certification expires in 90 days.",
  "You have three projects without evidence.",
  "Consider updating your forklift demonstration.",
  "You have enough experience to organize your work into a portfolio.",
  "Would you like to request a reference from your last employer?",
];

const opportunityTypes = [
  "Future Opportunities",
  "Employer Connections",
  "Staffing Connections",
  "Contract Opportunities",
  "Business Opportunities",
  "Content Opportunities",
];

const documents = ["W-2 archive", "Pay statements", "Training certificates", "Employment verification letter", "Resume draft"];
const references = ["Greenwood Logistics supervisor", "Mountain Freight shift lead", "Northline Warehouse coordinator"];

function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-lg leading-8 text-slate-400">{copy}</p>
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-white/10 bg-white/[0.025] p-5 sm:p-6 ${className}`}>{children}</div>;
}

function SourceCard({ label, icon: Icon, active, selected, onClick }: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-32 border p-4 text-left transition ${
        selected
          ? "border-emerald-300/60 bg-emerald-400/[0.08]"
          : "border-white/10 bg-black/30 hover:border-emerald-300/35"
      }`}
    >
      <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
      <p className="mt-5 text-sm font-semibold text-white">{label}</p>
      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
        {active ? "In use" : "Available"}
      </p>
    </button>
  );
}

export function WorkerValuePlatform() {
  const [selectedSource, setSelectedSource] = useState<string>(workSources[0].label);

  return (
    <section id="my-professional-life" className="border-t border-white/10 bg-[#020504] py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative overflow-hidden border border-emerald-400/20 bg-black p-6 sm:p-10"
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(52,211,153,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(52,211,153,0.04)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
          <div className="absolute right-0 top-0 h-72 w-72 bg-emerald-400/10 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_.78fr]">
            <div>
              <p className="inline-flex border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                Layer 09
              </p>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                Leave Every Job With More Than A Paycheck.
              </h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-slate-300">
                Every project, certification, skill, document, reference, and
                achievement strengthens your professional record and belongs to
                you.
              </p>
            </div>
            <div className="border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-2xl font-semibold text-white">My Professional Life</h2>
              <p className="mt-3 leading-7 text-slate-400">
                SAIN continuously organizes, protects, strengthens, and grows
                the worker&apos;s professional life before banking exists.
              </p>
              <div className="mt-6 grid gap-3">
                {["Professional Timeline", "Projects", "Evidence Vault", "Skills Passport", "Career AI"].map((item) => (
                  <div key={item} className="flex items-center gap-3 border border-white/10 bg-black/35 p-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden />
                    <span className="text-sm font-semibold text-slate-200">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mt-12 grid gap-4 lg:grid-cols-4">
          {[
            { icon: FolderOpen, label: "Projects", value: "12 documented" },
            { icon: Archive, label: "Evidence Vault", value: "28 items" },
            { icon: BadgeCheck, label: "Skills Passport", value: "8 skills" },
            { icon: UserCheck, label: "References", value: "3 active" },
          ].map(({ icon: Icon, label, value }) => (
            <Panel key={label}>
              <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
              <p className="mt-5 text-sm uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
            </Panel>
          ))}
        </div>

        <section className="mt-16">
          <SectionTitle
            eyebrow="Work Sources"
            title="All kinds of work can strengthen the same professional record."
            copy={`Selected source: ${selectedSource}. Workers can categorize work from employers, staffing agencies, independent contracts, self employment, creator work, software work, consulting, and local services.`}
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {workSources.map((source) => (
              <SourceCard
                key={source.label}
                {...source}
                selected={selectedSource === source.label}
                onClick={() => setSelectedSource(source.label)}
              />
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Projects</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Professional portfolio builder</h2>
              </div>
              <Plus className="h-6 w-6 text-emerald-300" aria-hidden />
            </div>
            <div className="mt-6 grid gap-4">
              {projects.map((project) => (
                <div key={project.name} className="border border-white/10 bg-black/30 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-white">{project.name}</h3>
                      <p className="mt-2 text-sm text-slate-400">{project.client} - {project.date}</p>
                    </div>
                    <span className="border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-xs font-semibold text-emerald-200">
                      {project.status}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.skills.map((skill) => (
                      <span key={skill} className="border border-white/10 px-3 py-1 text-xs text-slate-300">
                        {skill}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-400">Evidence: {project.evidence}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Lesson: {project.lesson}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Add Project Fields</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Capture the work while it is fresh.</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {["Project Name", "Description", "Client", "Date", "Skills Used", "Photos", "MP4 Evidence", "Files", "Completion Status", "Lessons Learned"].map((field) => (
                <div key={field} className="border border-white/10 bg-black/30 p-3 text-sm font-semibold text-slate-200">
                  {field}
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="mt-16">
          <SectionTitle
            eyebrow="Evidence Vault"
            title="Professional proof, protected and worker-controlled."
            copy="The vault stores MP4, photos, certificates, licenses, OSHA cards, driver licenses, references, resumes, PDF documents, and portfolios. Every item has status, preview, and permission sharing."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {evidenceVault.map((item) => (
              <Panel key={item.title}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{item.type}</p>
                    <h3 className="mt-3 text-lg font-semibold text-white">{item.title}</h3>
                  </div>
                  {item.type === "MP4" ? <PlaySquare className="h-6 w-6 text-emerald-300" aria-hidden /> : <FileText className="h-6 w-6 text-emerald-300" aria-hidden />}
                </div>
                <div className="mt-5 grid gap-2 text-sm text-slate-400">
                  <p>Date: {item.date}</p>
                  <p>Status: {item.status}</p>
                  <p>Preview: {item.preview}</p>
                  <p>Permission Sharing: {item.sharing}</p>
                </div>
              </Panel>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-[1fr_.9fr]">
          <Panel>
            <div className="flex items-center gap-3">
              <GraduationCap className="h-6 w-6 text-emerald-300" aria-hidden />
              <h2 className="text-2xl font-semibold text-white">Skills Passport</h2>
            </div>
            <div className="mt-6 grid gap-3">
              {skills.map((skill) => (
                <div key={skill.name} className="border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-white">{skill.name}</h3>
                      <p className="mt-2 text-sm text-slate-400">Evidence Attached: {skill.evidence}</p>
                    </div>
                    <span className={`border px-3 py-1 text-xs font-semibold ${skill.verified ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200" : "border-amber-300/25 bg-amber-300/[0.06] text-amber-100"}`}>
                      {skill.verified ? "Verified" : "Pending"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-400 md:grid-cols-3">
                    <p>Last Updated: {skill.updated}</p>
                    <p>Certification: {skill.cert}</p>
                    <p>Notes: {skill.notes}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-6">
            <Panel>
              <div className="flex items-center gap-3">
                <HeartPulse className="h-6 w-6 text-emerald-300" aria-hidden />
                <h2 className="text-2xl font-semibold text-white">Career Health</h2>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                Personal progress only. No worker rankings, leaderboards, or public comparisons.
              </p>
              <div className="mt-6 grid gap-4">
                {healthItems.map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="font-semibold text-slate-200">{item.label}</span>
                      <span className="font-mono text-emerald-300">{item.value}%</span>
                    </div>
                    <div className="mt-2 h-2 bg-white/10">
                      <div className="h-full bg-emerald-400" style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-emerald-300" aria-hidden />
                <h2 className="text-2xl font-semibold text-white">Career AI</h2>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                Not a chatbot. A career organizer that notices missing proof,
                expiring credentials, and ways to make the worker&apos;s record stronger.
              </p>
              <div className="mt-6 grid gap-3">
                {aiSuggestions.map((suggestion) => (
                  <div key={suggestion} className="border-l border-emerald-300/45 bg-black/30 p-4 text-sm leading-6 text-slate-300">
                    {suggestion}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-[1fr_.9fr]">
          <Panel>
            <div className="flex items-center gap-3">
              <Compass className="h-6 w-6 text-emerald-300" aria-hidden />
              <h2 className="text-2xl font-semibold text-white">Professional Timeline</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {timeline.map((item) => (
                <div key={`${item.type}-${item.title}`} className="border-l border-emerald-300/45 pl-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{item.type} - {item.date}</p>
                  <h3 className="mt-2 font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{item.source}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{item.note}</p>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-6">
            <Panel>
              <div className="flex items-center gap-3">
                <IdCard className="h-6 w-6 text-emerald-300" aria-hidden />
                <h2 className="text-2xl font-semibold text-white">Documents</h2>
              </div>
              <div className="mt-6 grid gap-3">
                {documents.map((document) => (
                  <div key={document} className="border border-white/10 bg-black/30 p-3 text-sm font-semibold text-slate-200">
                    {document}
                  </div>
                ))}
              </div>
            </Panel>
            <Panel>
              <div className="flex items-center gap-3">
                <Star className="h-6 w-6 text-emerald-300" aria-hidden />
                <h2 className="text-2xl font-semibold text-white">References</h2>
              </div>
              <div className="mt-6 grid gap-3">
                {references.map((reference) => (
                  <div key={reference} className="border border-white/10 bg-black/30 p-3 text-sm font-semibold text-slate-200">
                    {reference}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </section>

        <section className="mt-16">
          <SectionTitle
            eyebrow="Work Opportunities"
            title="Future opportunities, clearly separated from today's worker record."
            copy="SAIN is not building a job board here. This layer shows future connection surfaces that can be added when partners and workflows are ready."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {opportunityTypes.map((type) => (
              <Panel key={type}>
                <Lightbulb className="h-6 w-6 text-emerald-300" aria-hidden />
                <h3 className="mt-5 text-lg font-semibold text-white">{type}</h3>
                <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">
                  Coming Soon
                </p>
              </Panel>
            ))}
          </div>
        </section>

        <div className="mt-16 border border-emerald-400/20 bg-emerald-400/[0.06] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <ShieldCheck className="h-7 w-7 shrink-0 text-emerald-300" aria-hidden />
            <div>
              <h2 className="text-2xl font-semibold text-white">Worker-owned record</h2>
              <p className="mt-4 max-w-4xl leading-8 text-slate-300">
                Every completed job should leave the worker with more than a
                paycheck. SAIN preserves the proof, lessons, skills, documents,
                references, and milestones that make each next opportunity
                easier to understand and pursue.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
