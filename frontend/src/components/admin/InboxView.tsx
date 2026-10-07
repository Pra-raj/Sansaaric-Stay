"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  getInboxMessages,
  getInboxThread,
  sendReply,
  subscribeInboxEvents,
} from "@/lib/api-client";
import { INBOX_CHANNELS, type InboxListItem, type InboxThread } from "@/types";
import { InboxContact } from "./InboxContact";
import { InboxList } from "./InboxList";
import { InboxThread as ThreadPane } from "./InboxThread";

const channelFilters = ["All", ...INBOX_CHANNELS] as const;
type ChannelFilter = (typeof channelFilters)[number];

const panel = "flex min-h-0 flex-col overflow-hidden rounded-card border border-border/20 bg-surface";

// WS4: the inbox is refreshed by the SSE event stream instead of a fixed poll.
// A reconnect catches up automatically: the server's refresh watermark is
// re-derived at connect, so anything that changed mid-gap emits immediately.
const INBOX_MAX_ROWS = 100;

/**
 * The three-column inbox from documents/docadmin_chats.html: conversation list
 * (with search + channel pills), the chat window, and the contact-details pane.
 */
export function InboxView() {
  const [rows, setRows] = useState<InboxListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [channel, setChannel] = useState<ChannelFilter>("All");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<InboxThread | null>(null);
  const [threadErrorId, setThreadErrorId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  // Generation counter lets local edits win over an in-flight poll refresh
  // (C16): a mutation bumps it, so a stale poll result is dropped.
  const threadGenRef = useRef(0);

  // Selection is derived rather than written into an effect: fall back to the
  // newest row while nothing has been picked yet.
  const selected = selectedId ?? rows[0]?.id ?? null;
  const visibleThread = thread && thread.id === selected ? thread : null;
  const threadLoading = selected !== null && visibleThread === null;
  const threadFailed = threadErrorId !== null && threadErrorId === selected;
  const error = actionError && actionError.id === selected ? actionError.message : "";

  // The list is re-fetched server-side whenever search or channel changes;
  // this mirrors the template's refetchList() with its 300ms debounce.
  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(search), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const load = useCallback(() => {
    return getInboxMessages({ q: query, channel })
      .then((result) => {
        setRows(result);
        setLoadError("");
      })
      .catch(() => setLoadError("Couldn't load conversations. Try again."))
      .finally(() => setLoading(false));
  }, [query, channel]);

  const refreshList = useCallback(() => {
    return getInboxMessages({ q: query, channel })
      .then((result) => {
        setRows(result);
        setLoadError("");
      })
      .catch(() => setLoadError("Couldn't load conversations. Try again."));
  }, [query, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback((id: string) => {
    setSelectedId(id);
    setThreadErrorId(null);
    setActionError(null);
  }, []);

  // Fetch the selected thread, guarding results with the generation counter so
  // polls and retries never clobber a freshly-edited thread.
  const loadSelectedThread = useCallback(
    ({ silent = false } = {}) => {
      if (!selected) return;
      const gen = ++threadGenRef.current;
      const id = selected;
      getInboxThread(id)
        .then((next) => {
          if (gen === threadGenRef.current && selected === id) {
            setThread(next);
            setThreadErrorId(null);
          }
        })
        .catch(() => {
          if (gen === threadGenRef.current && selected === id && !silent) {
            // Mount an error pane with a retry instead of a permanent skeleton (U7).
            setThread(null);
            setThreadErrorId(id);
          }
        });
    },
    [selected],
  );

  useEffect(() => {
    loadSelectedThread();
  }, [loadSelectedThread, reloadKey]);

  // WS4: catch up on new messages via the SSE stream instead of a 5s poll.
  // Each `refresh` frame re-fetches the list + selected thread; the tab-visibility
  // handler below still catches immediate changes when the tab is re-focused. The
  // subscription reconnects itself until this component unmounts.
  useEffect(() => {
    const controller = new AbortController();
    subscribeInboxEvents(() => {
      void refreshList();
      loadSelectedThread({ silent: true });
    }, controller.signal);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshList();
        loadSelectedThread({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshList, loadSelectedThread]);

  function refresh() {
    void load();
  }

  async function handleSend(body: string): Promise<boolean> {
    if (!visibleThread) return false;
    threadGenRef.current++;
    setSending(true);
    setActionError(null);
    try {
      setThread(await sendReply(visibleThread.id, body));
      refresh();
      return true;
    } catch {
      setActionError({ id: visibleThread.id, message: "Couldn't send the reply. Try again." });
      return false;
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Inbox</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Conversations from every channel.
      </p>

      <div className="grid gap-3 lg:h-[calc(100dvh-13rem)] lg:grid-cols-[minmax(240px,25%)_minmax(0,40%)_minmax(240px,25%)]">
        {/* Column 1 — conversation list */}
        <section aria-label="Conversations" className={`${panel} min-h-[360px] lg:min-h-0`}>
          <div className="flex items-center gap-2 border-b border-border/20 px-3.5 py-3">
            <h2 className="text-sm font-semibold">Inbox</h2>
          </div>

          <div className="border-b border-border/20 p-2.5">
            <input
              type="text"
              autoComplete="off"
              placeholder="Search by name / email / phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-brand-500"
            />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {channelFilters.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  aria-pressed={channel === c}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    channel === c
                      ? "border-ink bg-ink text-white"
                      : "border-border bg-surface text-ink-soft hover:bg-bg"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-14" />
              ))}
            </div>
          ) : loadError ? (
            <p role="alert" className="p-6 text-center text-sm text-red-600">
              {loadError}
            </p>
          ) : (
            <>
              <InboxList threads={rows} selectedId={selected} onSelect={open} />
              {rows.length >= INBOX_MAX_ROWS && (
                <p className="border-t border-border/20 px-3.5 py-2 text-[11px] text-ink-soft">
                  Showing the {INBOX_MAX_ROWS} most recent conversations.
                </p>
              )}
            </>
          )}
        </section>

        {/* Column 2 — chat window */}
        <section
          aria-label="Conversation"
          className={`${panel} min-h-[420px] lg:min-h-0`}
        >
          {visibleThread ? (
            <ThreadPane
              thread={visibleThread}
              sending={sending}
              error={error}
              onSend={handleSend}
              onBack={() => setSelectedId(null)}
            />
          ) : threadLoading ? (
            <Skeleton className="m-4 h-full" />
          ) : threadFailed ? (
            <div className="m-auto flex flex-col items-center gap-3 p-8 text-center">
              <p role="alert" className="text-sm text-red-600">
                Could not load this conversation.
              </p>
              <button
                type="button"
                onClick={() => {
                  setThreadErrorId(null);
                  setReloadKey((k) => k + 1);
                }}
                className="rounded-lg border border-brand-500 bg-brand-500 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-600"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="m-auto p-8 text-center text-sm text-ink-soft">
              Select a conversation.
            </p>
          )}
        </section>

        {/* Column 3 — contact details */}
        <section aria-label="Contact details" className={`${panel} min-h-[420px] lg:min-h-0`}>
          <div className="border-b border-border/20 px-3.5 py-3 text-sm font-semibold">
            Contact Details
          </div>
          {visibleThread ? (
            <InboxContact key={visibleThread.id} thread={visibleThread} />
          ) : (
            <p className="m-auto p-6 text-center text-sm text-ink-soft">
              No conversation selected.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

