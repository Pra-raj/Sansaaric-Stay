import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { HotelBookingAside } from "@/components/booking/HotelBookingAside";
import { getHotelById, getHotelMedia, getHotelReviews } from "@/lib/api-client";
import { getSeedMedia, type HotelMedia } from "@/lib/seed-media";
import { isMockAllowed } from "@/lib/admin-security";
import { HotelReviewPrompt } from "@/components/hotel/HotelReviewPrompt";
import { HotelGallery } from "@/components/hotel/HotelGallery";
import { ReviewsSection } from "@/components/hotel/ReviewsSection";
import type { Hotel, HotelMediaApi, Review } from "@/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let hotel: Hotel | null = null;
  try {
    hotel = await getHotelById(id);
  } catch {
    return { title: "Stay unavailable" };
  }
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
  let hotel: Hotel | null = null;
  let hotelFailed = false;
  try {
    hotel = await getHotelById(id);
  } catch {
    hotelFailed = true;
  }
  if (hotelFailed) {
    return (
      <p className="py-24 text-center text-sm text-ink-soft">
        Could not load this stay. Please refresh the page.
      </p>
    );
  }
  if (!hotel) notFound();

  let reviews: Review[] = [];
  let reviewsFailed = false;
  try {
    reviews = await getHotelReviews(hotel.id);
  } catch {
    reviewsFailed = true;
  }

  // Real photos/video from the backend when available. Sample media is a
  // development-only fallback; production never shows invented photos.
  let media: HotelMedia | HotelMediaApi | null = null;
  try {
    media = await getHotelMedia(hotel.id);
  } catch {
    media = null;
  }
  if (!media && isMockAllowed()) media = getSeedMedia(hotel.name);

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
            <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-bg text-ink-soft">
              <ImageOff aria-hidden className="size-6" />
              <p className="text-sm">No photos yet</p>
            </div>
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
            {reviewsFailed ? (
              <p className="text-sm text-ink-soft">
                Could not load reviews. Please refresh the page.
              </p>
            ) : (
              <ReviewsSection reviews={reviews} rating={hotel.rating} />
            )}
          </div>
        </div>

        <HotelBookingAside hotel={hotel} />
      </div>
    </div>
  );
}
