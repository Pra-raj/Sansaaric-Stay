import { FilterPanel } from "@/components/search/FilterPanel";
import RecommendationCard from "@/components/search/RecommendationCard";
import { dummyHotels } from "@/lib/placeholder-data";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search stays",
  description: "Search and filter hotels, resorts, and homestays across Nepal.",
};

export default function SearchPage({
  searchParams,
}: {
  searchParams: { location?: string; q?: string };
}) {
  const initialLocation = searchParams.location ?? searchParams.q ?? "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold"> Search stays</h1>
        <select
          className="rounded-lg border border-black/10 bg-surface px-3 py-2 text-sm"
          defaultValue="recommended"
        >
          <option value="recommended">Sort: Recommended</option>
          <option value="price">Sort: Price</option>
          <option value="rating">Sort: Rating</option>
        </select>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <FilterPanel initialLocation={initialLocation} />
        <div className="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {dummyHotels.map((hotel) => (
            <RecommendationCard key={hotel.id} hotel={hotel} />
          ))}
        </div>
      </div>
    </div>
  );
}
