import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { dummyReviews, getHotelById } from "@/lib/placeholder-data";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const hotel = getHotelById(id);
  if (!hotel) return { title: "Hotel not found" };
  return {
    title: hotel.name,
    description: hotel.description,
  };
}

export default async function HotelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hotel = getHotelById(id);
  if (!hotel) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="flex aspect-video items-center justify-center rounded-card bg-brand-700 text-white/50">
            [ primary video player placeholder]
          </div>

          <div className="flex gap-2 overflow-x-auto">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-brnad-100 text-[10px] text-brand-600"
              >
                clip {n}
              </div>
            ))}
          </div>

          <div>
            <h1 className="text-2xl font-sans">{hotel.name}</h1>
            <p className="mt-1 text-ink-soft">
              {hotel.location} &bull; &#9733; {hotel.rating.toFixed(1)}{" "}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {hotel.tags.map((tag) => (
                <Badge key={tag} tone="brand">
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              {hotel.description}
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold">Amenities</h2>
            <ul className="grid grid-cols-2 gap-2 text-sm text-ink-soft sm:grid-cols-3">
              {hotel.amenities.split(",").map((a) => (
                <li key={a}> &bull; {a} </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-3 font-semibold">Reviews</h2>
            <div className="space-y-3">
              {dummyReviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-card border border-black/5 p-4"
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{review.authorName}</span>
                    <span> &#9733; {review.rating}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{review.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="h-fit space-y-4 rounded-card border border-black/5 bg-surface p-5 lg:sticky lg:top-24">
          <p className="text-lg font-semibold">
            {" "}
            NPR {hotel.startingPrice.toLocaleString()}{" "}
            <span className="text-sm font-normal text-ink-soft">/ night </span>
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-black/10 p-2.5">
              <p className="text-[10px] font-semibold uppercase text-ink-soft">
                Check-in
              </p>
              <p className="text-sm">Add date</p>
            </div>
            <div className="rounded-lg border border-black/10 p-2.5">
              <p className="text-[10px] font-semibold uppercase text-ink-soft">
                Check-out
              </p>
              <p className="text-sm">Add date</p>
            </div>
          </div>
          <div className="rounded-lg border border-black/10 p-2.5">
            <p className="text-[10px] font-semibold uppercase text-ink-soft">
              Guests
            </p>
            <p className="text-sm">2 guests</p>
          </div>
          <Link href={`/booking/${hotel.id}`}>
            <Button fullWidth>Book Now</Button>
          </Link>
          <button className="w-full text-center text-sm font-semibold text-brand-600 hover:underline">
            💬 Ask about this stay
          </button>
        </aside>
      </div>
    </div>
  );
}
