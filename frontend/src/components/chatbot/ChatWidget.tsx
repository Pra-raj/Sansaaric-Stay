"use client";

import { useEffect, useRef, useState } from "react";
import ChatBubble from "./ChatBubble";
import { useChat } from "@/lib/chat-context";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";

const suggestedQuestions = [
  "Anything near a lake under Rs. 3,000?",
  "What's the cancellation policy?",
  "Best stays for a sunrise view?",
];

// The widget's per-message shape.
type ChatMessage = {
  id?: string;
  from: "user" | "bot" | "error";
  text: string;
};

type ChatResponse = {
  conversation_id?: string | number;
  answer?: string;
  error?: string;
};

type SSEEvent = {
  type: "token" | "done" | "error";
  text?: string;
  answer?: string;
  conversation_id?: string | number;
  message?: string;
};

// The thread-push API echoes one JSON object per message as it is posted.
type HistoryMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type HistoryResponse = {
  conversation_id?: string | number;
  messages: HistoryMessage[];
};

type LiveEvent = {
  type: "message" | "done" | "error";
  message?: HistoryMessage;
};

// Anything past this idle gap without a frame is treated as a hung upstream, so
// the muted form never stays disabled forever (C10).
const STREAM_IDLE_TIMEOUT_MS = 60_000;

// The conversation (id + bubbles) survives a full page refresh so returning
// visitors pick the thread back up instead of spawning yet another one.
const CHAT_STATE_KEY = "sansaaric-chat-state";

type StoredChatState = {
  conversationId: string | number | null;
  messages: ChatMessage[];
};

function readStoredChatState(): StoredChatState {
  if (typeof window === "undefined") return { conversationId: null, messages: [] };
  try {
    const raw = localStorage.getItem(CHAT_STATE_KEY);
    if (!raw) return { conversationId: null, messages: [] };
    const parsed = JSON.parse(raw) as StoredChatState;
    if (!parsed || !Array.isArray(parsed.messages)) {
      return { conversationId: null, messages: [] };
    }
    return parsed;
  } catch {
    return { conversationId: null, messages: [] };
  }
}

function bodyFor(message: string, conversationId: string | number | null) {
  return JSON.stringify({
    message,
    conversation_id: conversationId,
    new: conversationId === null,
  });
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Server rows get a stable "srv-N" bubble id so history plays and live pushes
// can never duplicate a message that is already on screen.
function bubbleFor(m: HistoryMessage): ChatMessage {
  return {
    id: `srv-${m.id}`,
    from: m.role === "user" ? "user" : "bot",
    text: m.content,
  };
}

export function ChatWidget() {
  const { isOpen: open, close, open: openChat } = useChat();
  const { isLoggedIn } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const stored = readStoredChatState();
    return stored.messages.length > 0
      ? stored.messages
      : [
          {
            from: "bot",
            text: "Hi! I'm the Sansaaric Stay assistant. Ask me about a stay.",
          },
        ];
  });
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string | number | null>(
    () => readStoredChatState().conversationId,
  );
  const [pending, setPending] = useState(false);
  const [online, setOnline] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  // WS3: replies that arrive while the widget is closed count toward a badge on
  // the launcher; the subscription below stays alive for the whole visit.
  const [unread, setUnread] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const wasLoggedIn = useRef(isLoggedIn);
  const openRef = useRef(open);
  const pendingRef = useRef(pending);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Opening the widget clears the pending-reply badge and re-reconciles against
  // the server so replies that arrived while closed appear immediately. The
  // update is deferred so the effect body never mutates state synchronously.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setUnread(0);
      if (conversationId != null) setRefreshKey((k) => k + 1);
    });
  }, [open, conversationId]);

  // A channel owned by a logged-in account must not stay on this device after
  // that user logs out — wipe id + bubbles so the next person starts fresh.
  useEffect(() => {
    if (wasLoggedIn.current && !isLoggedIn) {
      setConversationId(null);
      setMessages([
        {
          from: "bot",
          text: "Hi! I'm the Sansaaric Stay assistant. Ask me about a stay.",
        },
      ]);
      try {
        localStorage.removeItem(CHAT_STATE_KEY);
      } catch {
        // storage blocked — the state above is already reset for this session
      }
    }
    wasLoggedIn.current = isLoggedIn;
  }, [isLoggedIn]);

  // Live thread: fetch the full history once when the widget opens, then keep
  // an SSE subscription open so an admin reply pops into the chat without
  // polling. The subscription stays alive even when the widget is closed, where
  // a new reply is counted into the launcher badge instead of being appended.
  // It reconciles by server id so it never duplicates (WS3).
  useEffect(() => {
    if (conversationId == null) return;

    const controller = new AbortController();
    let cancelled = false;

    async function loadHistory() {
      // A send is mid-flight (first-ever send flips conversationId while the
      // stream runs) — the local stream renders those rows; reconcile after.
      if (!openRef.current || pendingRef.current) return;
      try {
        const res = await fetch(
          `/api/chat/history?conversation_id=${encodeURIComponent(String(conversationId))}`,
          { headers: authHeaders(), cache: "no-store", signal: controller.signal },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json().catch(() => null)) as HistoryResponse | null;
        const bubbles = (data?.messages ?? []).map(bubbleFor);
        if (bubbles.length > 0) setMessages(bubbles);
      } catch {
        // offline or aborted — keep whatever is on screen
      }
    }

    loadHistory();

    (async () => {
      let sinceId = 0;
      while (!cancelled) {
        try {
          const res = await fetch(
            `/api/chat/events?conversation_id=${encodeURIComponent(String(conversationId))}&since_id=${sinceId}`,
            {
              headers: authHeaders(),
              cache: "no-store",
              signal: controller.signal,
            },
          );
          if (!res.ok || !res.body) break;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let exhausted = false;
          while (!cancelled && !exhausted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let frameEnd: number;
            while ((frameEnd = buffer.indexOf("\n\n")) !== -1) {
              const frame = buffer.slice(0, frameEnd);
              buffer = buffer.slice(frameEnd + 2);
              const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
              if (!dataLine) continue;
              let event: LiveEvent;
              try {
                event = JSON.parse(dataLine.slice(5).trim()) as LiveEvent;
              } catch {
                continue;
              }
              if (event.type === "message" && event.message) {
                sinceId = Math.max(sinceId, event.message.id);
                // Skip appends while a send is mid-flight — the local stream
                // already renders those rows; the next history reload reconciles.
                if (pendingRef.current) continue;
                const msg = event.message;
                if (openRef.current) {
                  setMessages((prev) =>
                    prev.some((m) => m.id === `srv-${msg.id}`)
                      ? prev
                      : [...prev, bubbleFor(msg)],
                  );
                } else {
                  // Widget closed: badge the reply; it is reconciled on reopen.
                  setUnread((n) => n + 1);
                }
              } else {
                exhausted = true;
              }
            }
          }
        } catch {
          if (cancelled) break;
        }
        if (!cancelled) {
          // Backend ends the stream after an idle window; reconnect so the
          // next admin reply still arrives.
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [conversationId, refreshKey]);

  // Keep the thread (id + bubbles) in localStorage so a page refresh doesn't
  // wipe the conversation or spawn a fresh one on the backend.
  useEffect(() => {
    try {
      localStorage.setItem(
        CHAT_STATE_KEY,
        JSON.stringify({ conversationId, messages } satisfies StoredChatState),
      );
    } catch {
      // storage full or blocked — chat still works, it just won't survive a refresh
    }
  }, [conversationId, messages]);

  // U16: the online dot reflects the backend health endpoint, re-probed on
  // mount and whenever a send hits the network.
  useEffect(() => {
    let mounted = true;
    fetch("/api/healthz", { cache: "no-store" })
      .then((r) => {
        if (mounted) setOnline(r.ok);
      })
      .catch(() => {
        if (mounted) setOnline(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // U12: keep the newest message in view while tokens stream in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, open]);

  function push(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  async function streamChat(message: string): Promise<"done" | "error" | "fallback"> {
    const controller = new AbortController();
    const idle = window.setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
    let receivedData = false;
    let bubbleId: string | null = null;
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: bodyFor(message, conversationId),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return "fallback";
      setOnline(true);

      bubbleId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const placeholder = { from: "bot" as const, text: "…", id: bubbleId };
      setMessages((prev) => [...prev, placeholder]);

      const updateBubble = (update: Partial<ChatMessage>) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === bubbleId ? { ...m, ...update, id: bubbleId } : m)),
        );

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let terminal: "done" | "error" | null = null;

      while (terminal === null) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedData = true;
        buffer += decoder.decode(value, { stream: true });
        let frameEnd: number;
        while ((frameEnd = buffer.indexOf("\n\n")) !== -1 && terminal === null) {
          const frame = buffer.slice(0, frameEnd);
          buffer = buffer.slice(frameEnd + 2);
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          let event: SSEEvent;
          try {
            event = JSON.parse(dataLine.slice(5).trim()) as SSEEvent;
          } catch {
            continue;
          }
          if (event.type === "token") {
            answer += event.text ?? "";
            updateBubble({ text: answer });
          } else if (event.type === "done") {
            answer = event.answer ?? answer;
            if (event.conversation_id !== undefined) setConversationId(event.conversation_id);
            updateBubble({ text: answer });
            terminal = "done";
          } else if (event.type === "error") {
            if (event.conversation_id !== undefined) setConversationId(event.conversation_id);
            updateBubble({ from: "bot", text: answer });
            push({
              from: "error",
              text: event.message ?? "Something went wrong while generating the answer.",
            });
            terminal = "error";
          }
        }
      }

      if (terminal === null) {
        // Stream ended without a terminal frame. Keep any tokens we did
        // receive; otherwise surface the disconnect as an error bubble.
        if (answer) {
          updateBubble({ text: answer });
        } else {
          updateBubble({ from: "bot", text: "" });
          push({ from: "error", text: "The connection was lost mid-answer. Please try again." });
        }
      }
      return terminal ?? "done";
    } catch {
      // A hard failure only falls back to the plain POST when nothing has
      // streamed yet; mid-stream drops keep the partial bubble and surface an
      // error instead (U13).
      if (receivedData && bubbleId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === bubbleId ? { ...m, from: "bot", text: m.text || "" } : m)),
        );
        push({ from: "error", text: "The connection was lost mid-answer. Please try again." });
      }
      return receivedData ? "error" : "fallback";
    } finally {
      window.clearTimeout(idle);
    }
  }

  async function postChat(message: string) {
    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: bodyFor(message, conversationId),
      });
    } catch {
      setOnline(false);
      push({ from: "error", text: "Can't reach the assistant. Check your connection and try again." });
      return;
    }
    setOnline(true);
    const data: ChatResponse | null = await res.json().catch(() => null);
    if (!res.ok || !data) {
      // A 404 means the thread no longer exists — clear it so the next send
      // opens a fresh conversation (C10).
      if (res.status === 404) setConversationId(null);
      push({
        from: "error",
        text:
          data?.error ??
          (res.status === 429
            ? "Too many requests. Wait a minute and try again."
            : "The assistant could not answer right now."),
      });
      return;
    }
    if (data.conversation_id !== undefined) setConversationId(data.conversation_id);
    push({ from: "bot", text: data.answer ?? "" });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setDraft("");
    push({ from: "user", text: message });
    setPending(true);
    try {
      // Prefer the stream; retry once via the plain POST only when the stream
      // couldn't even start (non-200 / network).
      const result = await streamChat(message);
      if (result === "fallback") await postChat(message);
      // Re-reconcile against the server once the send settles so rows the
      // live subscription skipped (or admin replies posted mid-send) appear.
      setRefreshKey((k) => k + 1);
    } finally {
      setPending(false);
    }
  }

  // WS2: a fresh conversation on this device — the server thread is kept, and
  // the next send opens a new one (bodyFor sends `new: true`).
  function startNewChat() {
    setConversationId(null);
    setUnread(0);
    setMessages([
      {
        from: "bot",
        text: "Hi! I'm the Sansaaric Stay assistant. Ask me about a stay.",
      },
    ]);
  }

  return (
    <div
      id="chat"
      className="fixed bottom-20 right-4 z-50 lg:bottom-6 lg:right-6"
    >
      {open && (
        <div className="anim-pop-in mb-3 flex h-[420px] max-h-[calc(100dvh-9rem)] w-[320px] max-w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-card border border-black/10 bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Sansaaric Stay Assistant</p>
              <p
                className={`text-xs ${
                  online ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                &bull; {online ? "Online" : "Offline"}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={startNewChat}
                aria-label="Start a new chat"
                title="Start a new chat"
                className="text-ink-soft hover:text-ink"
              >
                &#8634;
              </button>
              <button
                onClick={close}
                aria-label="Close chat"
                className="text-ink-soft hover:text-ink"
              >
                &#10006;
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <ChatBubble key={m.id ?? i} from={m.from} text={m.text} />
            ))}
            <div ref={endRef} />
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-black/5 px-3 py-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={pending}
                className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-ink-soft hover:bg-black/10 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex gap-2 border-t border-black/5 p-2.5"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={pending}
              placeholder="Ask about a stay..."
              className="flex-1 rounded-full border border-black/10 px-3.5 py-2 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
            >
              send
            </button>
          </form>
        </div>
      )}
      {!open && (
        <button
          onClick={openChat}
          className="anim-pop-in relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg transition-[transform,background-color] duration-200 hover:scale-105 hover:bg-brand-600 active:scale-95 motion-reduce:transition-none"
          aria-label="Open Chat"
        >
          💬
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
              {unread}
            </span>
          )}
        </button>
      )}
    </div>
  );
}