"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LIMITS } from "@/lib/admin-security";
import {
  channelLabels,
  formatTimestamp,
  inboxStatusTone,
} from "@/lib/admin-utils";
import type { InboxEntry, InboxMessage } from "@/types";

interface InboxThreadProps {
  thread: InboxMessage;
  sending: boolean;
  error: string;
  onSend: (body: string) => Promise<boolean>;
  onToggleResolved: () => void;
  onBack: () => void;
}

const authorLabel: Record<InboxEntry["from"], string> = {
  guest: "Guest",
  admin: "You",
  bot: "Chatbot",
};

export function InboxThread({
  thread,
  sending,
  error,
  onSend,
  onToggleResolved,
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
    const ok = await onSend(body);
    if (ok) setDraft("");
  }

  const resolved = thread.status === "Resolved";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b border-border/20 p-4">
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="-ml-1 mt-0.5 rounded-full p-1 text-ink-soft hover:bg-bg lg:hidden"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{thread.subject}</h2>
          <p className="truncate text-sm text-ink-soft">
            {thread.guestName} &middot; {thread.guestEmail}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{channelLabels[thread.channel]}</Badge>
            <Badge tone={inboxStatusTone(thread.status)}>{thread.status}</Badge>
          </div>
        </div>
        <Button variant="secondary" onClick={onToggleResolved}>
          {resolved ? "Reopen" : "Mark resolved"}
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {thread.entries.map((entry) => {
          const mine = entry.from === "admin";
          return (
            <div
              key={entry.id}
              className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  mine
                    ? "bg-brand-500 text-white"
                    : entry.from === "bot"
                      ? "border border-dashed border-border bg-surface text-ink-soft"
                      : "bg-bg text-ink"
                }`}
              >
                {entry.body}
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {authorLabel[entry.from]} &middot; {formatTimestamp(entry.sentAt)}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/20 p-4">
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Reply"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            maxLength={LIMITS.replyBody}
            placeholder={`Reply to ${thread.guestName}…`}
            className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand-500"
          />
          <Button
            onClick={() => void submit()}
            disabled={!draft.trim() || sending}
            className="disabled:opacity-50"
          >
            <Send aria-hidden className="size-4" />
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">Ctrl/⌘ + Enter to send</p>
      </div>
    </div>
  );
}
