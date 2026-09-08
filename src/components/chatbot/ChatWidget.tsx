"use client";

import { useState } from "react";
import ChatBubble from "./ChatBubble";
import { useChat } from "@/lib/chat-context";

const suggestedQuestions = [
  "Anything near a lake under Rs. 3,000?",
  "What's the cancellation policy?",
  "Best stays for a sunrise view?",
];

export function ChatWidget() {
  const { isOpen: open, close, open: openChat } = useChat();
  const [messages, setMessages] = useState<
    { from: "user" | "bot"; text: string }[]
  >([
    {
      from: "bot",
      text: "Hi! I'm the Sansaaric Stay assistant. Ask me about a stay.",
    },
  ]);
  const [draft, setDraft] = useState("");

  function send(text: string) {
    if (!text.trim()) return;
    setMessages((prev) => [
      ...prev,
      { from: "user", text },
      {
        from: "bot",
        text: "(placeholder reply - Only After The AI/MI is connected)",
      },
    ]);
    setDraft("");
  }

  return (
    <div
      id="chat"
      className="fixed bottom-20 right-4 z-50 md:bottom-6 md:right-6 "
    >
      {open && (
        <div className="mb-3 flex h-[420px] w-[320px] flex-col overflow-hidden rounded-card border border-black/10 bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Sansaaric Stay Assistant</p>
              <p className="text-xs text-emerald-600">&bull; Online</p>
            </div>

            <button
              onClick={close}
              aria-label="Close chat"
              className="text-ink-soft hover:text-ink"
            >
              &#10006;
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <ChatBubble key={i} from={m.from} text={m.text} />
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-black/5 px-3 py-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-ink-soft hover:bg-black/10"
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
              placeholder="Ask about a stay..."
              className="flex-1 rounded-full border border-black/10 px-3.5 py-2 text-sm outline-none focus:border-brand-500"
            />

            <button
              type="submit"
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
          className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg hover:bg-brand-600"
          aria-label="Open Chat"
        >
          💬
        </button>
      )}
    </div>
  );
}
