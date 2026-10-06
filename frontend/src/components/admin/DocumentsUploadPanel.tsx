"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { DOC_ACCEPT_ATTR, validateTrainingFile } from "@/lib/admin-utils";
import { validateFileSignature } from "@/lib/admin-security";

interface DocumentUploadPanelProps {
  /** Receives only files that passed validation. */
  onUpload: (files: File[]) => Promise<void>;
  uploading: boolean;
}

export function DocumentUploadPanel({
  onUpload,
  uploading,
}: DocumentUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const valid: File[] = [];
    const problems: string[] = [];
    for (const file of Array.from(fileList)) {
      const problem =
        validateTrainingFile(file) ?? (await validateFileSignature(file));
      if (problem) problems.push(problem);
      else valid.push(file);
    }
    setErrors(problems);
    if (valid.length > 0) await onUpload(valid);
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
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:border-brand-500 ${
          dragging
            ? "border-brand-500 bg-brand-50"
            : "border-border hover:border-brand-500"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <Upload aria-hidden className="size-6 text-brand-600" />
        <span className="text-sm font-semibold">
          {uploading ? "Uploading…" : "Drop files here or click to choose"}
        </span>
        <span className="text-xs text-ink-soft">
          PDF, DOCX, or TXT, up to 10 MB each
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

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 text-sm text-red-600">
          {errors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
