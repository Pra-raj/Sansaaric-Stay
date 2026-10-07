export default function ChatBubble({
  from,
  text,
}: {
  from: "user" | "bot" | "error";
  text: string;
}) {
  const isUser = from === "user";
  const isError = from === "error";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
          isUser
            ? "bg-brand-500 text-white"
            : isError
              ? "border border-red-300 bg-red-50 text-red-700"
              : "bg-ink/5 text-ink",
        ].join(" ")}
      >
        {text}
      </div>
    </div>
  );
}