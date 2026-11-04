import type { Hotel } from "@/types";

/** One rule for "does this hotel match this place", used by the home counts and the search page. */
export function matchesLocation(hotel: Hotel, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return hotel.location.toLowerCase().includes(q) || hotel.name.toLowerCase().includes(q);
}
