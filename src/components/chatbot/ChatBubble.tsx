export default function ChatBubble({
  from,
  text,
}: {
  from: "user" | "bot";
  text: string;
}) {
  const isUser = from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
          isUser ? "bg-brand-500 text-white" : "bg-ink/5 text-ink",
        ].join(" ")}
      >
        {text}
      </div>
    </div>
  );
}
