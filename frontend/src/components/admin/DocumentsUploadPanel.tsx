"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { DOC_ACCEPT_ATTR, formatFileSize, validateTrainingFile } from "@/lib/admin-utils";
import { validateFileSignature } from "@/lib/admin-security";

interface DocumentUploadPanelProps {
  /** Receives only files that passed validation. */
  onUpload: (files: File[]) => Promise<void>;
  uploading: boolean;
}

/**
 * Dropzone: choose files, see them as chips, then press "Upload & Train".
 */
export function DocumentUploadPanel({ onUpload, uploading }: DocumentUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    // Mirrors the backend's max_length=25 on the upload multi-list (C23).
    const MAX_FILES = 25;
    let incoming = Array.from(fileList);
    const problems: string[] = [];
    if (files.length + incoming.length > MAX_FILES) {
      problems.push(`You can upload at most ${MAX_FILES} files at once.`);
      incoming = incoming.slice(0, MAX_FILES - files.length);
    }
    const valid: File[] = [];
    for (const file of incoming) {
      const problem = validateTrainingFile(file) ?? (await validateFileSignature(file));
      if (problem) problems.push(problem);
      else valid.push(file);
    }
    if (problems.length > 0) setErrors((prev) => [...prev, ...problems]);
    else setErrors([]);
    setFiles((prev) => [...prev, ...valid]);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    void handleFiles(e.target.files);
    e.target.value = ""; // allow re-selecting the same file
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (!uploading) void handleFiles(e.dataTransfer.files);
  }

  async function submit() {
    if (files.length === 0) return;
    const sent = files;
    setFiles([]);
    try {
      await onUpload(sent);
    } catch {
      setFiles(sent); // put them back so the user can retry
    }
  }

  return (
    <div>
      <label
        htmlFor="training-doc-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-[170px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors focus-within:border-brand-500 ${
          dragging ? "border-brand-500 bg-brand-50" : "border-border hover:border-ink-soft"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <Upload aria-hidden className="size-6 text-brand-600" />
        <span className="text-[15px] font-bold">
          {uploading ? "Uploading…" : "Drop files here or click to choose"}
        </span>
        <span className="text-[13px] text-ink-soft">Drag & drop, or click to browse</span>
        <span className="mt-1.5 text-xs text-ink-soft">
          PDF, DOCX, TXT, MD, CSV, XLSX, XLS — up to 50 MB each
        </span>
        <input
          ref={inputRef}
          id="training-doc-input"
          type="file"
          multiple
          accept={DOC_ACCEPT_ATTR}
          onChange={handleChange}
          disabled={uploading}
          className="sr-only"
        />
      </label>

      <div className="mt-3.5 flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={uploading || files.length === 0}
          className="rounded-lg border border-brand-500 bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload & Train"}
        </button>
      </div>

      {files.length > 0 && (
        <p className="mt-2.5 text-[13px] text-ink-soft">
          <strong className="text-ink">{files.length}</strong>{" "}
          {files.length === 1 ? "file" : "files"} selected:{" "}
          {files.map((f) => f.name).join(", ")} ·{" "}
          {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}
        </p>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-[13px] text-red-600">
          {errors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
