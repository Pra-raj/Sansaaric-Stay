"use client";

import { useEffect, useState } from "react";
import { getInboxMessages } from "@/lib/api-client";
import { INBOX_CHANGED } from "@/lib/admin-utils";

/** Number of unread conversations, refreshed when the inbox page changes one. */
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getInboxMessages()
        .then((threads) => {
          if (!cancelled) setCount(threads.filter((t) => t.status === "Unread").length);
        })
        .catch(() => {
          // badge is optional; ignore errors
        });
    load();
    window.addEventListener(INBOX_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(INBOX_CHANGED, load);
    };
  }, []);

  return count;
}
