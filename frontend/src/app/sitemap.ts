import type { MetadataRoute } from "next";
import { dummyHotels } from "@/lib/placeholder-data";

const BASE_URL = "https://sansaaric.example.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/search", "/about", "/contact"].map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
  }));

  const hotelRoutes = dummyHotels.map((hotel) => ({
    url: `${BASE_URL}/hotels/${hotel.id}`,
    lastModified: new Date(),
  }));

  return [...staticRoutes, ...hotelRoutes];
}