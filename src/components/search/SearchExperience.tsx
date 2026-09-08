"use client";

import { useMemo, useState } from "react";
import { FilterPanel, type Filters } from "./FilterPanel";
import RecommendationCard from "./RecommendationCard";
import type { Hotel } from "@/types";

const sortOptions = [
  { value: "recommended", label: "Sort: Recommended" },
  { value: "price", label: "Sort: Price (low to high)" },
  { value: "rating", label: "Sort: Rating" },
];

export function SearchExperience({
  hotels,
  initialLocation,
}: {
  hotels: Hotel[];
  initialLocation: string;
}) {
  const [filters, setFilters] = useState<Filters>({
    location: initialLocation,
    minPrice: "",
    maxPrice: "",
    propertyTypes: [],
    minRating: null,
  });

  const [sort, setSort] = useState("recommended");

  const results = useMemo(() => {
    const min = filters.minPrice ? Number(filters.minPrice) : null;
    const max = filters.maxPrice ? Number(filters.maxPrice) : null;
    const locationQuery = filters.location.trim().toLowerCase();

    let filtered = hotels.filter((hotel) => {
      if (
        locationQuery &&
        !hotel.location.toLowerCase().includes(locationQuery) &&
        !hotel.name.toLowerCase().includes(locationQuery)
      ) {
        return false;
      }

      if (min !== null && hotel.startingPrice < min) return false;
      if (max !== null && hotel.startingPrice > max) return false;
      if (
        filters.propertyTypes.length > 0 &&
        !filters.propertyTypes.includes(hotel.propertyType)
      )
        return false;
      if (filters.minRating !== null && hotel.rating < filters.minRating)
        return false;

      return true;
    });

    if (sort === "price")
      filtered = [...filtered].sort(
        (a, b) => a.startingPrice - b.startingPrice,
      );
    if (sort === "rating")
      filtered = [...filtered].sort((a, b) => b.rating - a.rating);

    return filtered;
  }, [filters, hotels, sort]);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Search stays</h1>
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <FilterPanel filters={filters} onChange={setFilters} />

        {results.length > 0 ? (
          <div className="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((hotel) => (
              <RecommendationCard key={hotel.id} hotel={hotel} />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-card border border-dashed border-border/10 py-20 text-center">
            <p className=" text-lg font-semibold">
              No stays match those filters
            </p>
            <p className="mt-1 max-w-sm text-sm text-ink-soft">
              Try widening your price range, clearing the property type filters,
              or searching a different destination.
            </p>
          </div>
        )}
      </div>
    </>
  );
}