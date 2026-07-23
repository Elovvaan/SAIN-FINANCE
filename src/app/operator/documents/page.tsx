"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  FileArchive,
  FileText,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
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

type ApiError = { error?: string };

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

function readableError(code: string | undefined) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Your operator session has expired. Sign in again.",
    PASSWORD_CHANGE_REQUIRED: "A password change is required before using the repository.",
    DOCUMENT_FILE_REQUIRED: "Choose a file to upload.",
    DOCUMENT_FILE_TOO_LARGE: "The selected file exceeds the repository upload limit.",
    DOCUMENT_TITLE_REQUIRED: "Enter a document title.",
    DOCUMENT_TYPE_REQUIRED: "Enter a document type.",
    DOCUMENT_VERSION_NOT_FOUND: "The requested document version was not found.",
    DOCUMENT_INTEGRITY_FAILURE: "The stored document failed its checksum verification.",
    DOCUMENT_REPOSITORY_UNAVAILABLE: "The document repository is temporarily unavailable.",
  };
  return messages[code || ""] || code || "The request could not be completed.";
}

export default function OperatorDocumentsPage() {
  const [documents, setDocuments] = useState<RepositoryDocument[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [freezingId, setFreezingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const loadDocuments = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/documents?q=${encodeURIComponent(search)}`, {
        cache: "no-store",
      });
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
      setNotice("Document version uploaded and checksum recorded.");
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
    } catch (requestError) {
      setError(readableError(requestError instanceof Error ? requestError.message : undefined));
    } finally {
      setFreezingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#020504] text-slate-100">
      <div className="border-b border-emerald-400/15 bg-black/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">S</div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">SAIN Operator</p>
              <h1 className="text-lg font-semibold text-white">Document Repository</h1>
            </div>
          </div>
          <a href="/operator" className="text-sm text-slate-400 transition hover:text-white">Operator home</a>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Documents", String(totals.documents), FileText],
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
        </section>

        <section className="mt-6 border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={submitSearch} className="flex w-full max-w-xl gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, description, or document type"
                  className="h-11 w-full border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-400/50"
                />
              </div>
              <button type="submit" className="h-11 border border-white/10 px-4 text-sm text-slate-200 transition hover:border-emerald-400/40 hover:text-white">Search</button>
              <button type="button" onClick={() => void loadDocuments(query)} className="flex h-11 w-11 items-center justify-center border border-white/10 text-slate-400 transition hover:text-white" aria-label="Refresh documents">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </form>
            <button onClick={() => setShowUpload((current) => !current)} className="inline-flex h-11 items-center justify-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300">
              {showUpload ? <Plus className="h-4 w-4 rotate-45" /> : <Upload className="h-4 w-4" />}
              {showUpload ? "Close upload" : "Upload document"}
            </button>
          </div>

          {showUpload && (
            <form onSubmit={uploadDocument} className="grid gap-4 border-b border-emerald-400/15 bg-emerald-400/[0.035] p-5 md:grid-cols-2">
              <label className="text-sm text-slate-300">Title
                <input name="title" required className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3 outline-none focus:border-emerald-400/50" />
              </label>
              <label className="text-sm text-slate-300">Document type
                <input name="documentType" required placeholder="Agreement, filing, statement..." className="mt-2 h-11 w-full border border-white/10 bg-black/40 px-3 outline-none focus:border-emerald-400/50" />
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">Description
                <textarea name="description" rows={3} className="mt-2 w-full border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-emerald-400/50" />
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">File
                <input name="file" type="file" required className="mt-2 block w-full border border-dashed border-white/15 bg-black/30 p-4 text-sm file:mr-4 file:border-0 file:bg-emerald-400 file:px-4 file:py-2 file:font-semibold file:text-black" />
              </label>
              <div className="md:col-span-2 flex justify-end">
                <button disabled={uploading} className="inline-flex h-11 items-center gap-2 bg-emerald-400 px-5 text-sm font-semibold text-black disabled:opacity-60">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Uploading" : "Store document"}
                </button>
              </div>
            </form>
          )}

          {(notice || error) && (
            <div className={`border-b p-4 text-sm ${error ? "border-red-400/20 bg-red-400/5 text-red-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>
              {error || notice}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4">Document</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Version</th>
                  <th className="px-5 py-4">Size</th>
                  <th className="px-5 py-4">Integrity</th>
                  <th className="px-5 py-4">Updated</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-400"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-300" />Loading repository</td></tr>
                ) : documents.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-500">No documents found.</td></tr>
                ) : documents.map((document) => (
                  <tr key={document.document_id} className="transition hover:bg-white/[0.025]">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                        <div>
                          <p className="font-medium text-white">{document.title}</p>
                          <p className="mt-1 max-w-md truncate text-xs text-slate-500">{document.original_filename || document.description || document.document_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-300">{document.document_type}</td>
                    <td className="px-5 py-4"><span className="border border-white/10 bg-white/[0.04] px-2 py-1 text-xs">v{document.current_version}</span></td>
                    <td className="px-5 py-4 text-slate-400">{formatBytes(document.byte_length)}</td>
                    <td className="px-5 py-4">
                      {document.frozen ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300"><Lock className="h-3.5 w-3.5" />Frozen</span>
                      ) : (
                        <span className="text-xs text-amber-300">Mutable</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-400">{formatDate(document.updated_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <a href={`/api/operator/documents/${document.document_id}?disposition=inline`} target="_blank" rel="noreferrer" className="flex h-9 w-9 items-center justify-center border border-white/10 text-slate-400 transition hover:border-emerald-400/40 hover:text-white" aria-label={`Preview ${document.title}`}><Eye className="h-4 w-4" /></a>
                        <a href={`/api/operator/documents/${document.document_id}`} className="flex h-9 w-9 items-center justify-center border border-white/10 text-slate-400 transition hover:border-emerald-400/40 hover:text-white" aria-label={`Download ${document.title}`}><Download className="h-4 w-4" /></a>
                        <button disabled={Boolean(document.frozen) || freezingId === document.document_id} onClick={() => void freezeVersion(document)} className="inline-flex h-9 items-center gap-2 border border-white/10 px-3 text-xs text-slate-300 transition hover:border-emerald-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                          {freezingId === document.document_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                          {document.frozen ? "Frozen" : "Freeze"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
