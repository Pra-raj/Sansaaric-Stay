"use client";

import { Badge } from "@/components/ui/Badge";
import { channelLabels, formatRelativeTime } from "@/lib/admin-utils";
import type { InboxMessage } from "@/types";

interface InboxListProps {
  threads: InboxMessage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function InboxList({ threads, selectedId, onSelect }: InboxListProps) {
  if (threads.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-ink-soft">
        No conversations here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/10 overflow-y-auto">
      {threads.map((thread) => {
        const unread = thread.status === "Unread";
        const last = thread.entries[thread.entries.length - 1];
        return (
          <li key={thread.id}>
            <button
              onClick={() => onSelect(thread.id)}
              aria-current={selectedId === thread.id ? "true" : undefined}
              className={`block w-full px-4 py-3 text-left ${
                selectedId === thread.id ? "bg-brand-50" : "hover:bg-bg"
              }`}
            >
              <div className="flex items-center gap-2">
                {unread && (
                  <span
                    aria-label="Unread"
                    className="size-2 shrink-0 rounded-full bg-brand-500"
                  />
                )}
                <span
                  className={`truncate text-sm ${unread ? "font-bold" : "font-medium"}`}
                >
                  {thread.guestName}
                </span>
                <span className="ml-auto shrink-0 text-xs text-ink-soft">
                  {formatRelativeTime(thread.lastMessageAt)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm">{thread.subject}</p>
              <p className="mt-0.5 truncate text-xs text-ink-soft">
                {last?.body}
              </p>
              <div className="mt-2">
                <Badge>{channelLabels[thread.channel]}</Badge>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
