import type { MetadataRoute } from "next";
import { getHotels } from "@/lib/api-client";

const BASE_URL = "https://sansaaric.example.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/search", "/about", "/contact"].map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
  }));

  let hotelRoutes: MetadataRoute.Sitemap = [];
  try {
    const hotels = await getHotels();
    hotelRoutes = hotels.map((hotel) => ({
      url: `${BASE_URL}/hotels/${hotel.id}`,
      lastModified: new Date(),
    }));
  } catch {
    // Backend unreachable: still ship the static routes.
  }

  return [...staticRoutes, ...hotelRoutes];
}
