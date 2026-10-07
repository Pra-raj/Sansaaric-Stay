"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { getTrainingDocumentContent, trainTrainingDocument } from "@/lib/api-client";
import {
  docStatusLabel,
  docStatusTone,
  formatTimestamp,
} from "@/lib/admin-utils";
import { Badge } from "@/components/ui/Badge";
import type { TrainingDocument, TrainingDocumentDetail } from "@/types";

interface TrainedDirectoryProps {
  documents: TrainingDocument[];
  loadFailed: boolean;
  onView: (id: string) => void;
  /** Called after a successful re-train so the parent can refresh its list. */
  onChanged: () => void;
}

/**
 * "Trained Directory" from docadmin.html: a file list on the left, the trained
 * chunk content reconstructed on the right, with Details / Re-train actions.
 */
export function TrainedDirectory({ documents, loadFailed, onView, onChanged }: TrainedDirectoryProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{
    id: string;
    data: TrainingDocumentDetail;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retrainingId, setRetrainingId] = useState<string | null>(null);

  // Fall back to the first trained file so the pane is never a dead end, and
  // drop a selection that has since been deleted.
  const activeId =
    (pickedId && documents.some((d) => d.id === pickedId)
      ? pickedId
      : documents[0]?.id ?? null) ?? null;
  // A cached document is only shown once it matches the active file.
  const detail = loaded && loaded.id === activeId ? loaded.data : null;
  const detailError = loadError && (!loaded || loaded.id !== activeId) ? loadError : "";

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    getTrainingDocumentContent(activeId)
      .then((result) => {
        if (!cancelled) setLoaded({ id: activeId, data: result });
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load this document's content.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  async function retrain(id: string) {
    setRetrainingId(id);
    setLoadError("");
    try {
      await trainTrainingDocument(id);
      onChanged();
    } catch {
      setLoadError("Couldn't re-queue training. Try again.");
    } finally {
      setRetrainingId(null);
    }
  }

  if (documents.length === 0 && !loadFailed) {
    return (
      <p className="rounded-card border border-dashed border-border/20 py-10 text-center text-sm text-ink-soft">
        Nothing trained yet — upload a file above.
      </p>
    );
  }

  const fileBtn =
    "block w-full border-b border-border/10 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-bg";

  return (
    <div>
      <div className="grid gap-3.5 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="max-h-[480px] self-start overflow-y-auto rounded-lg border border-border/20 bg-surface">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setPickedId(doc.id)}
              aria-pressed={activeId === doc.id}
              className={`${fileBtn} ${activeId === doc.id ? "bg-brand-50" : ""}`}
            >
              <span className="block truncate text-[13.5px] font-semibold">
                {doc.name}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
                <Badge tone={docStatusTone(doc.status)} outline={doc.status === "pending"}>
                  {docStatusLabel(doc.status)}
                </Badge>
                <span className="ml-auto">{doc.chunkCount} chunks</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-col rounded-lg border border-border/20 bg-surface p-4">
          <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
            <h3 className="text-[15px] font-semibold">{detail?.name || "—"}</h3>
            <span className="text-xs text-ink-soft">
              {detail ? `${detail.fileType} · ${formatTimestamp(detail.uploadedAt)}` : ""}
            </span>
          </div>

          <div className="min-h-[220px] flex-1 overflow-y-auto rounded-md border border-border/20 bg-bg p-3.5 text-[13.5px] leading-relaxed">
            {detailError ? (
              <p className="text-sm text-red-600">{detailError}</p>
            ) : !detail ? (
              <Skeleton className="h-40" />
            ) : detail.chunks.length === 0 ? (
              <p className="text-sm text-ink-soft">
                This document has no trained chunks yet.
              </p>
            ) : (
              detail.chunks.map((chunk) => (
                <div key={chunk.index} className="mb-3.5 last:mb-0">
                  <span className="mb-1.5 inline-block rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.4px] text-ink-soft">
                    Chunk {chunk.index}
                  </span>
                  <p className="whitespace-pre-wrap break-words">{chunk.content}</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/20 pt-3">
            <button
              type="button"
              disabled={!detail}
              onClick={() => detail && onView(detail.id)}
              className="text-[13px] font-semibold text-brand-600 hover:underline disabled:opacity-50 disabled:no-underline"
            >
              Details
            </button>
            <button
              type="button"
              disabled={!detail || retrainingId === detail?.id}
              onClick={() => detail && void retrain(detail.id)}
              className="text-[13px] font-semibold text-brand-600 hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {retrainingId === detail?.id ? "Re-training…" : "Re-train"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
