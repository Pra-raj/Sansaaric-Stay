import manifest from "../../public/seed/manifest.json";

// Sample photos and videos for test hotels (public/seed/<slug>/).
// A hotel gets media only if its name is in manifest.json.
// To use your own: replace the files, keep the names (1.jpg 2.jpg 3.jpg video.mp4).
export interface HotelMedia {
  images: string[];
  video: string | null;
}

export function getSeedMedia(hotelName: string): HotelMedia | null {
  const slug = (manifest as Record<string, string>)[hotelName];
  if (!slug) return null;
  return {
    images: [1, 2, 3].map((n) => `/seed/${slug}/${n}.jpg`),
    video: `/seed/${slug}/video.mp4`,
  };
}

const DESTINATIONS = ["pokhara", "kathmandu", "nagarkot", "bandipur", "ghandruk", "chitwan", "lumbini"];

// Sample photo for a destination (public/seed/destinations/<name>.jpg).
export function getDestinationImage(name: string): string | null {
  const key = name.trim().toLowerCase();
  return DESTINATIONS.includes(key) ? `/seed/destinations/${key}.jpg` : null;
}
