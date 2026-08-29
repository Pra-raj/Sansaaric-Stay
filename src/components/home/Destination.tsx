import { topDestinations } from "@/lib/placeholder-data";
import DestinationCard from "@/components/home/DestinationCard";

export default function Destination() {
  return (
    <section className="bg-brand-50 py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#e86f51]">
            Go somewhere new
          </p>
          <h3 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Top Destinations
          </h3>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {topDestinations.map((d) => (
            <DestinationCard key={d.id} destination={d} />
          ))}
        </div>
      </div>
    </section>
  );
}
