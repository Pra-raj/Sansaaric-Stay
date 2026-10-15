import { getRecommendations } from "@/lib/api-client";
import RecommendationCardItem from "../search/RecommendationCard";
import Link from "next/link";

async function Recommendation() {
  const hotels = await getRecommendations(4);

  return (
    <section className="bg-surface py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
              Handpicked for you
            </p>
            <h2 className="text-4xl font-semibold">Top Recommended</h2>
          </div>
          <Link
            href="/search"
            className="text-sm font-semibold text-brand-600 hover:underline"
          >
            View all stays <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {hotels.map((hotel) => (
            <RecommendationCardItem key={hotel.id} hotel={hotel} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default Recommendation;
