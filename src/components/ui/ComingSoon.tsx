export default function ComingSoon({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-start justify-center px-6 py-20">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
        Sansaaric Stay
      </p>
      <h1 className="mb-3 mt-2 text-3xl font-bold">{title}</h1>
      <p className="max-w-md text-sm text-ink-soft">
        {note ?? "This page isn't built yet — it'll arrive once this section goes live."}
      </p>
    </main>
  );
}
