import { SearchExperience } from "@/components/search/SearchExperience";
import { getHotels } from "@/lib/api-client";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search stays",
  description: "Search and filter hotels, resorts, and homestays across Nepal.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { location?: string; q?: string };
}) {
  const initialLocation = searchParams.location ?? searchParams.q ?? "";
  const hotels = await getHotels();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <SearchExperience hotels={hotels} initialLocation={initialLocation} />
    </div>
  );
}
