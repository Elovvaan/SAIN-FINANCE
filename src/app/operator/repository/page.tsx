"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpenCheck,
  Building2,
  Download,
  Eye,
  FileArchive,
  FileText,
  History,
  Landmark,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  WalletCards,
} from "lucide-react";

type RepositoryDocument = {
  document_id: string;
  title: string;
  document_type: string;
  description: string | null;
  status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
  original_filename: string | null;
  media_type: string | null;
  checksum_sha256: string | null;
  byte_length: string | number | null;
  frozen: boolean | null;
  signed_at: string | null;
};

type DocumentEvent = {
  event_id: string;
  document_version_id: string | null;
  event_type: string;
  actor_user_id: string;
  occurred_at: string;
  source_ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  version_number: number | null;
  original_filename: string | null;
  checksum_sha256: string | null;
};

type ApiError = { error?: string };

type RepositoryArea = {
  id: string;
  label: string;
  description: string;
  icon: typeof FileText;
  documentTypes: string[];
};

const repositoryAreas: RepositoryArea[] = [
  {
    id: "entity",
    label: "Entity Documents",
    description: "Formation, charter, registration, ownership, and governing records.",
    icon: Building2,
    documentTypes: ["ENTITY_DOCUMENT", "CHARTER", "FORMATION", "REGISTRATION", "GOVERNANCE"],
  },
  {
    id: "authority",
    label: "Authority Documents",
    description: "Institutional authority, approvals, delegations, and official mandates.",
    icon: Landmark,
    documentTypes: ["AUTHORITY_DOCUMENT", "AUTHORIZATION", "DELEGATION", "APPROVAL"],
  },
  {
    id: "agreements",
    label: "Agreements",
    description: "Executed agreements, contracts, account relationships, and obligations.",
    icon: BookOpenCheck,
    documentTypes: ["AGREEMENT", "CONTRACT", "MASTER_ACCOUNT_AGREEMENT", "SERVICE_AGREEMENT"],
  },
  {
    id: "assets",
    label: "Institution Assets",
    description: "Ownership records, collateral files, valuations, and asset evidence.",
    icon: Archive,
    documentTypes: ["ASSET_RECORD", "COLLATERAL", "VALUATION", "OWNERSHIP_RECORD"],
  },
  {
    id: "instruments",
    label: "Financial Instruments",
    description: "Issued, held, pledged, transferred, redeemed, or retired instruments.",
    icon: WalletCards,
    documentTypes: ["FINANCIAL_INSTRUMENT", "NOTE", "SECURITY", "CERTIFICATE", "INSTRUMENT"],
  },
  {
    id: "policies",
    label: "Policies",
    description: "Institutional policies, standards, controls, and governing procedures.",
    icon: ShieldCheck,
    documentTypes: ["POLICY", "STANDARD", "CONTROL_POLICY", "SECURITY_POLICY", "COMPLIANCE_POLICY"],
  },
  {
    id: "manuals",
    label: "Operational Manuals",
    description: "Internal operating manuals, procedures, workflows, and staff guidance.",
    icon: FileArchive,
    documentTypes: ["OPERATIONAL_MANUAL", "PROCEDURE", "WORKFLOW", "STAFF_GUIDE"],
  },
  {
    id: "archive",
    label: "Archived Records",
    description: "Frozen, superseded, historical, and retained institutional records.",
    icon: Archive,
    documentTypes: ["ARCHIVED_RECORD", "HISTORICAL_RECORD", "SUPERSEDED_RECORD"],
  },
];

function normalizeType(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatBytes(value: string | number | null) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    DOCUMENT_CREATED: "Document created",
    VERSION_UPLOADED: "New version uploaded",
    VERSION_FROZEN: "Version frozen",
    DOCUMENT_PREVIEWED: "Document previewed",
    DOCUMENT_DOWNLOADED: "Document downloaded",
  };
  return labels[eventType] || eventType.replaceAll("_", " ").toLowerCase();
}

function readableError(code: string | undefined) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using the repository.",
    DOCUMENT_FILE_REQUIRED: "Choose a file to upload.",
    DOCUMENT_FILE_TOO_LARGE: "The selected file exceeds the repository upload limit.",
    DOCUMENT_TITLE_REQUIRED: "Enter a document title.",
    DOCUMENT_TYPE_REQUIRED: "Choose an institutional record type.",
    DOCUMENT_NOT_FOUND: "The requested document was not found.",
    DOCUMENT_VERSION_NOT_FOUND: "The requested document version was not found.",
    DOCUMENT_INTEGRITY_FAILURE: "The stored document failed its checksum verification.",
    DOCUMENT_REPOSITORY_UNAVAILABLE: "The institutional repository is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

export default function InstitutionalRepositoryPage() {
  const [documents, setDocuments] = useState<RepositoryDocument[]>([]);
  const [query, setQuery] = useState("");
  const [activeAreaId, setActiveAreaId] = useState("entity");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [freezingId, setFreezingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [historyDocument, setHistoryDocument] = useState<RepositoryDocument | null>(null);
  const [events, setEvents] = useState<DocumentEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const activeArea = repositoryAreas.find((area) => area.id === activeAreaId) ?? repositoryAreas[0];

  const loadDocuments = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/documents?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const body = (await response.json()) as { documents?: RepositoryDocument[] } & ApiError;
      if (response.status === 401) {
        window.location.assign("/operator/login");
        return;
      }
      if (!response.ok) throw new Error(body.error || "DOCUMENT_REPOSITORY_UNAVAILABLE");
      setDocuments(body.documents || []);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = useMemo(() => {
    const allowed = new Set(activeArea.documentTypes.map(normalizeType));
    return documents.filter((document) => {
      const type = normalizeType(document.document_type || "");
      if (activeArea.id === "archive") return Boolean(document.frozen) || allowed.has(type);
      return allowed.has(type);
    });
  }, [activeArea, documents]);

  const counts = useMemo(() => {
    const entries = repositoryAreas.map((area) => {
      const allowed = new Set(area.documentTypes.map(normalizeType));
      const count = documents.filter((document) => {
        const type = normalizeType(document.document_type || "");
        if (area.id === "archive") return Boolean(document.frozen) || allowed.has(type);
        return allowed.has(type);
      }).length;
      return [area.id, count] as const;
    });
    return Object.fromEntries(entries) as Record<string, number>;
  }, [documents]);

  const totals = useMemo(() => {
    const bytes = documents.reduce((sum, document) => sum + Number(document.byte_length || 0), 0);
    const frozen = documents.filter((document) => document.frozen).length;
    return { documents: documents.length, bytes, frozen };
  }, [documents]);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadDocuments(query);
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setError(null);
    setNotice(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/operator/documents", { method: "POST", body: data });
      const body = (await response.json()) as ApiError;
      if (response.status === 401) {
        window.location.assign("/operator/login");
        return;
      }
      if (!response.ok) throw new Error(body.error || "DOCUMENT_REPOSITORY_UNAVAILABLE");
      form.reset();
      setShowUpload(false);
      setNotice("Institutional record stored. Version and checksum were recorded.");
      await loadDocuments(query);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setUploading(false);
    }
  }

  async function freezeVersion(document: RepositoryDocument) {
    if (document.frozen) return;
    setFreezingId(document.document_id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/operator/documents/${document.document_id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "freeze", versionNumber: document.current_version }),
      });
      const body = (await response.json()) as ApiError;
      if (response.status === 401) {
        window.location.assign("/operator/login");
        return;
      }
      if (!response.ok) throw new Error(body.error || "DOCUMENT_REPOSITORY_UNAVAILABLE");
      setNotice(`Version ${document.current_version} of ${document.title} is now frozen.`);
      await loadDocuments(query);
      if (historyDocument?.document_id === document.document_id) await openHistory(document);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setFreezingId(null);
    }
  }

  async function openHistory(document: RepositoryDocument) {
    setHistoryDocument(document);
    setHistoryLoading(true);
    setEvents([]);
    setError(null);
    try {
      const response = await fetch(`/api/operator/documents/${document.document_id}/events`, { cache: "no-store" });
      const body = (await response.json()) as { events?: DocumentEvent[] } & ApiError;
      if (response.status === 401) {
        window.location.assign("/operator/login");
        return;
      }
      if (!response.ok) throw new Error(body.error || "DOCUMENT_REPOSITORY_UNAVAILABLE");
      setEvents(body.events || []);
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020504] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-emerald-400/15 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">S</div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Institutional Records</p>
              <h1 className="text-lg font-semibold text-white">Institutional Repository</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/operator/departments/documents" className="border border-white/10 px-3 py-2 text-slate-300 hover:border-emerald-300/40 hover:text-white">Document Operations</Link>
            <Link href="/operator/control-center" className="border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-emerald-100 hover:bg-emerald-400/20">CEO Control Center</Link>
          </div>
        </div>
      </header>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Controlled institutional records</p>
          <h2 className="mt-4 text-4xl font-semibold sm:text-6xl">Repository</h2>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">Entity records, authority documents, agreements, assets, instruments, policies, manuals, and archived records remain inside one versioned, checksum-verified institutional repository.</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[280px_1fr]">
        <aside className="grid content-start gap-2">
          {repositoryAreas.map((area) => {
            const Icon = area.icon;
            const selected = area.id === activeAreaId;
            return (
              <button
                key={area.id}
                onClick={() => setActiveAreaId(area.id)}
                className={`flex items-center justify-between gap-3 border px-4 py-3 text-left transition ${selected ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-100" : "border-white/10 text-slate-400 hover:border-emerald-300/35 hover:text-white"}`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-emerald-300" aria-hidden />
                  <span className="text-sm font-semibold">{area.label}</span>
                </span>
                <span className="text-xs">{counts[area.id] || 0}</span>
              </button>
            );
          })}
        </aside>

        <section className="min-w-0">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Institutional records", String(totals.documents), FileText],
              ["Stored content", formatBytes(totals.bytes), FileArchive],
              ["Frozen versions", String(totals.frozen), ShieldCheck],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">{String(label)}</p>
                  <Icon className="h-5 w-5 text-emerald-300" />
                </div>
                <p className="mt-4 text-3xl font-semibold text-white">{String(value)}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 border border-white/10 bg-white/[0.025]">
            <div className="flex flex-col gap-5 border-b border-white/10 p-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Current repository area</p>
                <h3 className="mt-2 text-2xl font-semibold">{activeArea.label}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{activeArea.description}</p>
              </div>
              <button onClick={() => setShowUpload((current) => !current)} className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300">
                {showUpload ? <Plus className="h-4 w-4 rotate-45" /> : <Upload className="h-4 w-4" />}
                {showUpload ? "Close upload" : "Add institutional record"}
              </button>
            </div>

            <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
              <form onSubmit={submitSearch} className="flex w-full max-w-xl gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search institutional records" className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-400/50" />
                </div>
                <button type="submit" className="h-11 border border-white/10 px-4 text-sm text-slate-200 transition hover:border-emerald-400/40 hover:text-white">Search</button>
                <button type="button" onClick={() => void loadDocuments(query)} className="flex h-11 w-11 items-center justify-center border border-white/10 text-slate-400 transition hover:text-white" aria-label="Refresh documents">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </form>
              <p className="text-sm text-slate-500">{filteredDocuments.length} record{filteredDocuments.length === 1 ? "" : "s"}</p>
            </div>

            {showUpload && (
              <form onSubmit={uploadDocument} className="grid gap-4 border-b border-emerald-400/15 bg-emerald-400/[0.035] p-5 md:grid-cols-2">
                <label className="text-sm text-slate-300">Title<input name="title" required className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3 outline-none focus:border-emerald-400/50" /></label>
                <label className="text-sm text-slate-300">Institutional record type
                  <select name="documentType" required defaultValue={activeArea.documentTypes[0]} className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3 outline-none focus:border-emerald-400/50">
                    {repositoryAreas.flatMap((area) => area.documentTypes.map((type) => ({ type, area: area.label }))).map(({ type, area }) => (
                      <option key={type} value={type}>{area} — {type.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-300 md:col-span-2">Description<textarea name="description" rows={3} className="mt-2 w-full border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-emerald-400/50" /></label>
                <label className="text-sm text-slate-300 md:col-span-2">File<input name="file" type="file" required className="mt-2 block w-full border border-dashed border-white/15 bg-black/30 p-4 text-sm file:mr-4 file:border-0 file:bg-emerald-400 file:px-4 file:py-2 file:font-semibold file:text-black" /></label>
                <div className="md:col-span-2 flex justify-end">
                  <button disabled={uploading} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black disabled:opacity-60">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "Uploading" : "Store institutional record"}
                  </button>
                </div>
              </form>
            )}

            {(notice || error) && <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{error || notice}</div>}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Record</th>
                    <th className="px-5 py-4">Type</th>
                    <th className="px-5 py-4">Version</th>
                    <th className="px-5 py-4">Integrity</th>
                    <th className="px-5 py-4">Updated</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {loading ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading institutional records...</td></tr>
                  ) : filteredDocuments.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No records are stored in this repository area.</td></tr>
                  ) : filteredDocuments.map((document) => (
                    <tr key={document.document_id} className="align-top hover:bg-white/[0.02]">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-white">{document.title}</p>
                        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{document.description || document.original_filename || "Institutional record"}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-300">{document.document_type.replaceAll("_", " ")}</td>
                      <td className="px-5 py-4 text-slate-300">v{document.current_version}{document.frozen ? " · Frozen" : ""}</td>
                      <td className="px-5 py-4">
                        <p className="text-slate-300">{formatBytes(document.byte_length)}</p>
                        <p className="mt-1 max-w-48 truncate font-mono text-xs text-slate-600">{document.checksum_sha256 || "No checksum"}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-400">{formatDate(document.updated_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <a href={`/api/operator/documents/${document.document_id}?disposition=inline`} target="_blank" rel="noreferrer" className="flex h-9 w-9 items-center justify-center border border-white/10 text-slate-300 hover:border-emerald-300/40 hover:text-white" aria-label={`Preview ${document.title}`}><Eye className="h-4 w-4" /></a>
                          <a href={`/api/operator/documents/${document.document_id}?disposition=attachment`} className="flex h-9 w-9 items-center justify-center border border-white/10 text-slate-300 hover:border-emerald-300/40 hover:text-white" aria-label={`Download ${document.title}`}><Download className="h-4 w-4" /></a>
                          <button onClick={() => void openHistory(document)} className="flex h-9 w-9 items-center justify-center border border-white/10 text-slate-300 hover:border-emerald-300/40 hover:text-white" aria-label={`History for ${document.title}`}><History className="h-4 w-4" /></button>
                          <button disabled={Boolean(document.frozen) || freezingId === document.document_id} onClick={() => void freezeVersion(document)} className="flex h-9 w-9 items-center justify-center border border-white/10 text-slate-300 hover:border-emerald-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Freeze ${document.title}`}><Lock className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {historyDocument && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/70">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#050807] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Version and access history</p>
                <h3 className="mt-2 text-2xl font-semibold">{historyDocument.title}</h3>
              </div>
              <button onClick={() => setHistoryDocument(null)} className="border border-white/10 px-3 py-2 text-sm text-slate-300 hover:text-white">Close</button>
            </div>
            <div className="mt-6 grid gap-3">
              {historyLoading ? <p className="text-slate-400">Loading history...</p> : events.length === 0 ? <p className="text-slate-400">No history events were returned.</p> : events.map((event) => (
                <article key={event.event_id} className="border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{eventLabel(event.event_type)}</p>
                      <p className="mt-1 text-sm text-slate-500">{formatDate(event.occurred_at)}</p>
                    </div>
                    {event.version_number ? <span className="border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-1 text-xs text-emerald-200">v{event.version_number}</span> : null}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Actor: {event.actor_user_id}</p>
                  {event.checksum_sha256 ? <p className="mt-2 break-all font-mono text-[11px] text-slate-600">{event.checksum_sha256}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
