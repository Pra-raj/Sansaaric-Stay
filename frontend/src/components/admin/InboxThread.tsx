"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LIMITS } from "@/lib/admin-security";
import { formatTimestamp } from "@/lib/admin-utils";
import type { InboxEntry, InboxThread as Thread } from "@/types";

interface InboxThreadProps {
  thread: Thread;
  sending: boolean;
  error: string;
  onSend: (body: string) => Promise<boolean>;
  onBack: () => void;
}

/**
 * Column 2 of the inbox, mirroring documents/docadmin_chat_thread.html:
 * guest bubbles flush right, assistant answers flush left, and RAG sources
 * under a <details> disclosure.
 */
export function InboxThread({
  thread,
  sending,
  error,
  onSend,
  onBack,
}: InboxThreadProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.id, thread.entries.length]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    if (await onSend(body)) setDraft("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-2 border-b border-border/20 px-3.5 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="-ml-1 rounded-full p-1 text-ink-soft hover:bg-bg lg:hidden"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <h2 className="text-sm font-semibold">Chat</h2>
        <span className="truncate text-[13px] text-ink-soft">{thread.contactName}</span>
        {thread.createdAt && (
          <span className="ml-auto shrink-0 text-[11px] text-ink-soft">
            Started {formatTimestamp(thread.createdAt)}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
        {thread.entries.length === 0 ? (
          <p className="m-auto text-sm text-ink-soft">No messages in this conversation.</p>
        ) : (
          thread.entries.map((entry) => <Bubble key={entry.id} entry={entry} />)
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/20 bg-surface p-3">
        {error && (
          <p role="alert" className="mb-1.5 text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <input
            aria-label="Message"
            type="text"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() && !sending) void submit();
            }}
            placeholder="Type a message…"
            maxLength={LIMITS.replyBody}
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 focus:bg-surface"
          />
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!draft.trim() || sending}
            className="!rounded-lg !px-4 !py-2 disabled:opacity-50"
          >
            <Send aria-hidden className="size-4" />
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ entry }: { entry: InboxEntry }) {
  const fromGuest = entry.from === "guest";

  // Guest bubbles sit flush right, bot answers flush left — as in
  // docadmin_chat_thread.html (role user vs. assistant).
  return (
    <div className={`flex flex-col ${fromGuest ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3.5 py-2.5 text-sm ${
          fromGuest
            ? "border border-border bg-ink/10 text-ink"
            : "border border-border bg-surface text-ink"
        }`}
      >
        <span>{entry.body}</span>

        {entry.citations && entry.citations.length > 0 && (
          <details className="mt-2 text-[13px]">
            <summary className="cursor-pointer font-semibold text-brand-600 select-none">
              Sources ({entry.citations.length})
            </summary>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {entry.citations.map((c, i) => (
                <span
                  key={`${c.source}-${i}`}
                  title={c.text}
                  className="cursor-help rounded-full border border-border/60 bg-bg px-2.5 py-0.5 text-xs text-ink-soft"
                >
                  {c.source ?? c.title ?? "Source"}
                  {c.page ? ` · p${c.page}` : ""}
                </span>
              ))}
            </div>
          </details>
        )}

        <span className="mt-1.5 block text-[11px] text-ink-soft">
          {formatTimestamp(entry.sentAt)}
        </span>
      </div>
    </div>
  );
}
