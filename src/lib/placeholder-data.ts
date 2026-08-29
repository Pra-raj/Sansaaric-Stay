import type { Booking, Destination, Hotel, Review } from "@/types";

export const topDestinations: Destination[] = [
  { id: "pokhara", name: "Pokhara", HotelCount: 24 },
  { id: "kathmandu", name: "Kathmandu", HotelCount: 41 },
  { id: "bhaktapur", name: "Bhaktapur", HotelCount: 9 },
  { id: "lalitpur", name: "Lalitpur", HotelCount: 13 },
];

/**
 * DUMMY DATA — Week 1-2 only.
 * Every screen in this phase reads from here instead of a real API
 * (Phase 1 checkpoint explicitly says "frontend shell running locally
 * with dummy data"). In Phase 2, once Subesh's endpoints are live,
 * these functions get replaced by real fetches in lib/api-client.ts —
 * the components themselves won't need to change much because they
 * already expect this same Hotel[] / Booking[] shape.
 */

export const dummyHotels: Hotel[] = [
  {
    id: "hotel-pokhara-lake-view",
    name: "Lake View Homestay",
    location: "Pokhara, Nepal",
    propertyType: "Homestay",
    rating: 4.8,
    startingPrice: 2500,
    tags: ["Lakeside", "Mountain view", "Breakfast included"],
    description:
      "A family-run homestay on the edge of Phewa Lake, five minutes on foot from the lakeside strip. Wake up to the Annapurna range across the water.",
    amenities: "Free Wi-Fi, Breakfast included, Lake view, Airport pickup",
  },
  {
    id: "hotel-thamel-boutique",
    name: "Thamel Boutique Stay",
    location: "Kathmandu, Nepal",
    propertyType: "hotel",
    rating: 4.5,
    startingPrice: 3200,
    tags: ["City center", "Rooftop cafe"],
    description:
      "A small boutique hotel tucked in a quiet lane just off Thamel's main strip — close to the nightlife, far enough to actually sleep.",
    amenities: "Free Wi-Fi, Rooftop cafe, 24/7 front desk, Airport pickup",
  },
  {
    id: "hotel-nagarkot-resort",
    name: "Nagarkot Sunrise Resort",
    location: "Nagarkot, Nepal",
    propertyType: "Resort",
    rating: 4.9,
    startingPrice: 5800,
    tags: ["Sunrise view", "Himalaya view", "Fireplace rooms"],
    description:
      "Perched on the Nagarkot ridge with one of the most reliable Himalayan sunrise views near Kathmandu. Every room faces the mountains.",
    amenities: "Free Wi-Fi, Himalaya view, In-room fireplace, Restaurant on-site",
  },
  {
    id: "hotel-chitwan-jungle",
    name: "Chitwan Jungle Lodge",
    location: "Chitwan, Nepal",
    propertyType: "Resort",
    rating: 4.6,
    startingPrice: 4100,
    tags: ["Jungle safari", "National park"],
    description:
      "Inside Chitwan National Park's buffer zone — jeep safaris, canoe rides, and a real chance at spotting a rhino before breakfast.",
    amenities: "Jungle safari included, Free Wi-Fi, Restaurant on-site",
  },
];

export function getHotelById(id: string): Hotel | undefined {
  return dummyHotels.find((h) => h.id === id);
}

export const dummyReviews: Review[] = [
  { id: "r1", authorName: "Anika S.", rating: 5, comment: "Exactly like the video — stunning lake view from the room." },
  { id: "r2", authorName: "Marcus T.", rating: 4, comment: "Lovely hosts, breakfast was great. Wi-Fi was a little slow." },
  { id: "r3", authorName: "Priya K.", rating: 5, comment: "Booked in five minutes flat. Would stay again." },
];

export const dummyBookings: Booking[] = [
  {
    id: "bk-1042",
    hotelName: "Lake View Homestay",
    location: "Pokhara, Nepal",
    checkIn: "2026-09-12",
    checkOut: "2026-09-15",
    guests: 2,
    status: "Upcoming",
  },
  {
    id: "bk-0981",
    hotelName: "Thamel Boutique Stay",
    location: "Kathmandu, Nepal",
    checkIn: "2026-06-02",
    checkOut: "2026-06-04",
    guests: 1,
    status: "Completed",
  },
  {
    id: "bk-0877",
    hotelName: "Nagarkot Sunrise Resort",
    location: "Nagarkot, Nepal",
    checkIn: "2026-03-20",
    checkOut: "2026-03-21",
    guests: 3,
    status: "Cancelled",
  },
];