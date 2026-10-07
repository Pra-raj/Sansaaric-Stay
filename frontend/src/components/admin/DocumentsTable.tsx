"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  docStatusLabel,
  docStatusTone,
  formatFileSize,
  formatTimestamp,
} from "@/lib/admin-utils";
import type { TrainingDocument } from "@/types";

interface DocumentsTableProps {
  documents: TrainingDocument[];
  loading: boolean;
  loadFailed: boolean;
  deletingId: string | null;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DocumentsTable({
  documents,
  loading,
  loadFailed,
  deletingId,
  onView,
  onDelete,
}: DocumentsTableProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-12" />
        ))}
      </div>
    );
  }

  // A failed initial load must not render a cheerful "nothing here" empty state.
  if (documents.length === 0 && !loadFailed) {
    return (
      <p className="rounded-card border border-dashed border-border/20 py-12 text-center text-sm text-ink-soft">
        No documents yet. Upload a policy or guide and the chatbot will use it
        to answer guests.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border/20 bg-surface shadow-sm">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border/20 text-xs text-ink-soft">
          <tr>
            <th className="px-4 py-3 font-semibold">File</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Size</th>
            <th className="px-4 py-3 font-semibold">Upload date</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/10">
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td className="max-w-[260px] px-4 py-3">
                <p className="truncate font-medium">{doc.name}</p>
              </td>
              <td className="px-4 py-3 text-ink-soft">{doc.fileType}</td>
              <td className="px-4 py-3 text-ink-soft">
                {formatFileSize(doc.sizeBytes)}
              </td>
              <td className="px-4 py-3 text-ink-soft">
                {formatTimestamp(doc.uploadedAt)}
              </td>
              <td className="px-4 py-3">
                <Badge tone={docStatusTone(doc.status)} outline={doc.status === "pending"}>
                  {docStatusLabel(doc.status)}
                </Badge>
                {doc.status === "failed" && doc.errorMessage && (
                  <p className="mt-1 max-w-[240px] text-xs text-red-600" title={doc.errorMessage}>
                    {doc.errorMessage}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button
                  onClick={() => onView(doc.id)}
                  className="mr-2 text-sm font-semibold text-brand-600 hover:underline"
                >
                  Details
                </button>
                {confirmId === doc.id ? (
                  <span className="inline-flex items-center gap-3">
                    <span className="text-xs text-ink-soft">Delete?</span>
                    <button
                      onClick={() => {
                        setConfirmId(null);
                        onDelete(doc.id);
                      }}
                      className="text-sm font-semibold text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-sm font-semibold text-ink-soft hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmId(doc.id)}
                    disabled={deletingId === doc.id}
                    aria-label={`Delete ${doc.name}`}
                    className="rounded-full p-2 text-ink-soft hover:bg-bg hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
