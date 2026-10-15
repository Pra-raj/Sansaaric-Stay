"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteTrainingDocument,
  getTrainingDocumentContent,
  getTrainingDocuments,
  trainTrainingDocument,
  uploadTrainingDocuments,
} from "@/lib/api-client";
import { formatFileSize, formatTimestamp, docStatusLabel } from "@/lib/admin-utils";
import type { TrainingDocument, TrainingDocumentDetail } from "@/types";
import { DocumentUploadPanel } from "./DocumentsUploadPanel";
import { DocumentsTable } from "./DocumentsTable";
import { TrainedDirectory } from "./DocumentsTrainedDirectory";

const POLL_MS = 2500;

export function DocumentsView() {
  const [documents, setDocuments] = useState<TrainingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  // Monotonic generation counter (C17): every local mutation bumps it, and a
  // poll/refresh response is only applied when no mutation happened while it
  // was in flight — a stale snapshot can't resurrect a deleted/edited row.
  const generationRef = useRef(0);

  function refresh() {
    const generation = generationRef.current;
    return getTrainingDocuments()
      .then((rows) => {
        if (generation === generationRef.current) setDocuments(rows);
      })
      .catch(() => {
        /* keep showing the last known list */
      });
  }

  useEffect(() => {
    let cancelled = false;
    getTrainingDocuments()
      .then((result) => {
        if (!cancelled) setDocuments(result);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          setError("Couldn't load documents. Try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // While anything is still being indexed, re-check until it settles.
  const hasProcessing = documents.some(
    (d) => d.status === "processing" || d.status === "pending",
  );
  useEffect(() => {
    if (!hasProcessing) return;
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [hasProcessing]);

  async function handleUpload(files: File[]) {
    setUploading(true);
    setError("");
    try {
      const created = await uploadTrainingDocuments(files);
      generationRef.current += 1;
      setDocuments((prev) => [...created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload. Try again.");
      throw err; // lets the panel put the files back for a retry
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError("");
    // Optimistically drop the row and bump the generation so any poll that was
    // already in flight can't put it back.
    generationRef.current += 1;
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (detailId === id) setDetailId(null);
    try {
      await deleteTrainingDocument(id);
    } catch {
      setError("Couldn't delete the document. Try again.");
      void refresh(); // reset from the server in case the delete didn't land
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Train Chat Bot</h1>
      <p className="mb-6 max-w-xl text-sm text-ink-soft">
        The chatbot answers guest questions from these files. New uploads show
        as Processing until they&apos;re indexed.
      </p>

      <section className="rounded-card border border-border/20 bg-surface p-4 shadow-sm">
        <p className="mb-2 text-[13px] font-bold text-ink">Upload a training file</p>
        <DocumentUploadPanel onUpload={handleUpload} uploading={uploading} />
      </section>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <section className="mt-8">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Uploaded Files</h2>
          <span className="text-xs text-ink-soft">auto-refreshes</span>
        </div>
        <DocumentsTable
          documents={documents}
          loading={loading}
          loadFailed={loadFailed}
          deletingId={deletingId}
          onView={setDetailId}
          onDelete={handleDelete}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">Trained Directory</h2>
        <p className="mb-3.5 text-[13px] text-ink-soft">
          Knowledge base files the bot answers from — previews are reconstructed
          from trained chunks.
        </p>
        <TrainedDirectory
          documents={documents.filter((d) => d.status === "ready")}
          loadFailed={loadFailed}
          onView={setDetailId}
          onChanged={() => void refresh()}
        />
      </section>

      {detailId && (
        <DocumentDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onTrained={() => void refresh()}
        />
      )}
    </div>
  );
}

function DocumentDetailModal({
  id,
  onClose,
  onTrained,
}: {
  id: string;
  onClose: () => void;
  onTrained: () => void;
}) {
  const [detail, setDetail] = useState<TrainingDocumentDetail | null>(null);
  const [error, setError] = useState("");
  const [training, setTraining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTrainingDocumentContent(id)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this document.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function train() {
    if (!detail) return;
    setTraining(true);
    setError("");
    try {
      await trainTrainingDocument(detail.id);
      onTrained();
    } catch {
      setError("Couldn't re-queue training.");
      setTraining(false);
    }
  }

  const rows: Array<[string, string]> = detail
    ? [
        ["Document id", detail.id],
        ["File", detail.name],
        ["Type", detail.fileType],
        ["Size", formatFileSize(detail.sizeBytes)],
        ["Uploaded", formatTimestamp(detail.uploadedAt)],
        ["Status", docStatusLabel(detail.status)],
        ["Chunks", String(detail.chunkCount)],
        ...(detail.errorMessage ? ([["Error", detail.errorMessage]] as Array<[string, string]>) : []),
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-5"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-detail-title"
        className="max-h-[80vh] w-full max-w-[480px] overflow-y-auto rounded-lg border border-border bg-surface p-5"
      >
        <h3 id="doc-detail-title" className="mb-3 text-base font-semibold">
          Document details
        </h3>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {!detail && !error ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : (
          <dl className="mb-4 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            {rows.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="font-semibold text-ink-soft">{key}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] font-semibold text-ink hover:bg-bg dark:hover:bg-ink/5"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void train()}
            disabled={!detail || training}
            className="rounded-lg border border-brand-500 bg-brand-500 px-3 py-2 text-[13px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {training ? "Re-training…" : "Re-train"}
          </button>
        </div>
      </div>
    </div>
  );
}
