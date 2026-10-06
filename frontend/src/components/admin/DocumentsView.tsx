"use client";

import { useEffect, useState } from "react";
import {
  deleteTrainingDocument,
  getTrainingDocuments,
  uploadTrainingDocument,
} from "@/lib/api-client";
import type { TrainingDocument } from "@/types";
import { DocumentUploadPanel } from "./DocumentsUploadPanel";
import { DocumentsTable } from "./DocumentsTable";

const POLL_MS = 2500;

export function DocumentsView() {
  const [documents, setDocuments] = useState<TrainingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getTrainingDocuments()
      .then((result) => {
        if (!cancelled) setDocuments(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load documents. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // While anything is still being indexed, re-check until it settles.
  const hasProcessing = documents.some((d) => d.status === "Processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const id = window.setInterval(() => {
      getTrainingDocuments()
        .then(setDocuments)
        .catch(() => {
          // keep showing the last known list; the next tick retries
        });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [hasProcessing]);

  async function handleUpload(files: File[]) {
    setUploading(true);
    setError("");
    const failed: string[] = [];
    for (const file of files) {
      try {
        const doc = await uploadTrainingDocument(file);
        setDocuments((prev) => [doc, ...prev]);
      } catch {
        failed.push(file.name);
      }
    }
    if (failed.length > 0) {
      setError(`Couldn't upload: ${failed.join(", ")}. Try again.`);
    }
    setUploading(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError("");
    try {
      await deleteTrainingDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setError("Couldn't delete the document. Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Training documents</h1>
      <p className="mb-6 max-w-xl text-sm text-ink-soft">
        The chatbot answers guest questions from these files. New uploads show
        as Processing until they&apos;re indexed.
      </p>

      <DocumentUploadPanel onUpload={handleUpload} uploading={uploading} />

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-8">
        <DocumentsTable
          documents={documents}
          loading={loading}
          deletingId={deletingId}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
