"use client";

import { formatRelativeTime } from "@/lib/admin-utils";
import type { InboxListItem } from "@/types";

interface InboxListProps {
  threads: InboxListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Column 1 of the inbox, mirroring documents/docadmin_chats_list.html:
 * avatar, name, snippet + time.
 */
export function InboxList({ threads, selectedId, onSelect }: InboxListProps) {
  if (threads.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-ink-soft">
        No conversations match your filter.
      </p>
    );
  }

  return (
    <ul className="flex-1 space-y-1 overflow-y-auto p-2">
      {threads.map((thread) => {
        const selected = selectedId === thread.id;
        return (
          <li key={thread.id}>
            <button
              type="button"
              onClick={() => onSelect(thread.id)}
              aria-current={selected ? "true" : undefined}
              className={`flex w-full gap-2.5 rounded-lg border px-2.5 py-2.5 text-left transition-colors ${
                selected
                  ? "border-border bg-brand-50/60"
                  : "border-transparent hover:bg-bg"
              }`}
            >
              <span
                aria-hidden
                className="size-[34px] shrink-0 rounded-full border border-border/40 bg-ink/10"
              />
              <span className="min-w-0 flex-1 pr-12">
                <span className="block truncate text-[13.5px] font-semibold">
                  {thread.contactName}
                </span>
                <span className="mt-0.5 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-ink-soft">
                    {thread.snippet || "No messages yet"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-soft">
                    <span className="rounded border border-border/60 bg-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {thread.channel}
                    </span>
                    {formatRelativeTime(thread.lastMessageAt)}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
