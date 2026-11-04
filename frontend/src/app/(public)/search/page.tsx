import { SearchLoader } from "@/components/search/SearchLoader";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search stays",
  description: "Search and filter hotels, resorts, and homestays across Nepal.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; q?: string }>;
}) {
  const { location, q } = await searchParams;
  const initialLocation = location ?? q ?? "";

  // The page shows instantly; hotels load in the browser (shared cache, skeleton while waiting).
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <SearchLoader key={initialLocation} initialLocation={initialLocation} />
    </div>
  );
}
