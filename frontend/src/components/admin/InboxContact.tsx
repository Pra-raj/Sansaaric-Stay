"use client";

import type { InboxThread } from "@/types";

interface InboxContactProps {
  thread: InboxThread;
}

/**
 * Column 3 of the inbox: read-only contact summary. The name is derived
 * server-side (full account name, or "Guest" for anonymous chats); email and
 * phone come from the account / chat intake. Nothing is editable here.
 */
export function InboxContact({ thread }: InboxContactProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 pt-5">
      <div className="mx-auto mb-3.5 size-[72px] rounded-full border border-border/40 bg-ink/10" />
      <p className="mb-3 text-center text-[15px] font-semibold">{thread.contactName}</p>

      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
        Channel source
      </p>
      <span className="inline-block rounded-full border border-border bg-bg px-3 py-1 text-xs font-semibold">
        {thread.channel}
      </span>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div>
          <p className="mb-1 text-[12px] font-semibold text-ink-soft">Email</p>
          <p className="truncate text-[13.5px] text-ink-soft" title={thread.contactEmail}>
            {thread.contactEmail || "—"}
          </p>
        </div>
        {thread.contactPhone && (
          <div>
            <p className="mb-1 text-[12px] font-semibold text-ink-soft">Phone</p>
            <p className="text-[13.5px] text-ink-soft">{thread.contactPhone}</p>
          </div>
        )}
      </div>
    </div>
  );
}