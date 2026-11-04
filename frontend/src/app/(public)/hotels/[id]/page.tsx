import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { HotelBookingAside } from "@/components/booking/HotelBookingAside";
import { getHotelById, getHotelReviews } from "@/lib/api-client";
import { getSeedMedia } from "@/lib/seed-media";
import { HotelReviewPrompt } from "@/components/hotel/HotelReviewPrompt";
import { HotelGallery } from "@/components/hotel/HotelGallery";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const hotel = await getHotelById(id);
  if (!hotel) return { title: "Hotel not found" };
  return {
    title: hotel.name,
    description: hotel.description,
    openGraph: {
      title: `${hotel.name} — Sansaaric Stay`,
      description: hotel.description,
      type: "website",
    },
  };
}

export default async function HotelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hotel = await getHotelById(id);
  if (!hotel) notFound();
  const reviews = await getHotelReviews(hotel.id);
  const media = getSeedMedia(hotel.name);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: hotel.name,
    description: hotel.description,
    address: hotel.location,
    starRating: { "@type": "Rating", ratingValue: hotel.rating },
    priceRange: `NPR ${hotel.startingPrice}`,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        {/* Left: photo/video gallery + info */}
        <div className="space-y-6">
          {media ? (
            <HotelGallery media={media} name={hotel.name} />
          ) : (
            <>
              <div className="flex aspect-video items-center justify-center rounded-card border border-brand-500/20 bg-gradient-to-b from-brand-800 via-brand-600 to-brand-500 text-white/60 shadow-xl">
                [ photo &amp; video gallery — images load from the backend ]
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-100 text-[10px] text-brand-600 shadow-sm"
                  >
                    photo {n}
                  </div>
                ))}
              </div>
            </>
          )}

          <div>
            <h1 className="text-2xl font-bold">{hotel.name}</h1>
            <p className="mt-1 text-ink-soft">
              {hotel.location} · ★ {hotel.rating.toFixed(1)}
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

          {hotel.amenities.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold">Amenities</h2>
              <ul className="grid grid-cols-2 gap-2 text-sm text-ink-soft sm:grid-cols-3">
                {hotel.amenities.map((amenity) => (
                  <li key={amenity}>· {amenity}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="mb-3 font-semibold">Reviews</h2>
            <HotelReviewPrompt hotelName={hotel.name} />
            <div className="space-y-3">
              {reviews.length === 0 && (
                <p className="text-sm text-ink-soft">No reviews yet.</p>
              )}
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-card border border-black/5 bg-surface p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{review.authorName}</span>
                    <span>★ {review.rating}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{review.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <HotelBookingAside hotel={hotel} />
      </div>
    </div>
  );
}
