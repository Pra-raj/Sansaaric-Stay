"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  getInboxMessages,
  sendReply,
  updateInboxStatus,
} from "@/lib/api-client";
import { INBOX_CHANGED } from "@/lib/admin-utils";
import type { InboxMessage, InboxStatus } from "@/types";
import { InboxList } from "./InboxList";
import { InboxThread } from "./InboxThread";

const filters = ["All", "Unread", "Resolved"] as const;
type Filter = (typeof filters)[number];

export function InboxView() {
  const [threads, setThreads] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getInboxMessages()
      .then((result) => {
        if (!cancelled) setThreads(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load conversations. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function replaceThread(updated: InboxMessage) {
    setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  const visible = threads.filter((t) =>
    filter === "All" ? true : t.status === filter,
  );
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  function handleSelect(id: string) {
    setSelectedId(id);
    setActionError("");
    const thread = threads.find((t) => t.id === id);
    if (thread?.status === "Unread") {
      // Optimistic: opening an unread conversation marks it as read.
      replaceThread({ ...thread, status: "Open" });
      window.dispatchEvent(new Event(INBOX_CHANGED));
      updateInboxStatus(id, "Open")
        .then(() => window.dispatchEvent(new Event(INBOX_CHANGED)))
        .catch(() => {
          replaceThread(thread);
          window.dispatchEvent(new Event(INBOX_CHANGED));
        });
    }
  }

  async function handleSend(body: string): Promise<boolean> {
    if (!selected) return false;
    setSending(true);
    setActionError("");
    try {
      replaceThread(await sendReply(selected.id, body));
      return true;
    } catch {
      setActionError("Couldn't send the reply. Try again.");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function handleToggleResolved() {
    if (!selected) return;
    const next: InboxStatus = selected.status === "Resolved" ? "Open" : "Resolved";
    setActionError("");
    try {
      replaceThread(await updateInboxStatus(selected.id, next));
    } catch {
      setActionError("Couldn't update the conversation. Try again.");
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Inbox</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Conversations from the chatbot, contact form, and email.
      </p>

      <div className="flex min-h-[520px] overflow-hidden rounded-card border border-border/20 bg-surface shadow-sm lg:h-[calc(100dvh-13rem)]">
        <section
          aria-label="Conversations"
          className={`min-h-0 w-full flex-col border-border/20 lg:flex lg:w-[340px] lg:shrink-0 lg:border-r ${
            selected ? "hidden" : "flex"
          }`}
        >
          <div className="flex gap-1 border-b border-border/20 p-2">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  filter === f
                    ? "bg-brand-50 text-brand-600"
                    : "text-ink-soft hover:bg-bg"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-16" />
              ))}
            </div>
          ) : loadError ? (
            <p role="alert" className="p-6 text-center text-sm text-red-600">
              {loadError}
            </p>
          ) : (
            <InboxList
              threads={visible}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          )}
        </section>

        <section
          aria-label="Conversation"
          className={`min-h-0 min-w-0 flex-1 lg:flex ${selected ? "flex" : "hidden"}`}
        >
          {selected ? (
            <div className="min-w-0 flex-1">
              <InboxThread
                thread={selected}
                sending={sending}
                error={actionError}
                onSend={handleSend}
                onToggleResolved={handleToggleResolved}
                onBack={() => setSelectedId(null)}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-ink-soft">
              Select a conversation to read and reply.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
