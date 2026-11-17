"use client";

import { useMemo, useState } from "react";
import { FilterPanel, type Filters } from "./FilterPanel";
import RecommendationCard from "./RecommendationCard";
import { matchesLocation } from "@/lib/hotel-filter";
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
  // On phones the filters start collapsed so the results are visible first.
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount =
    (filters.location.trim() ? 1 : 0) +
    (filters.minPrice || filters.maxPrice ? 1 : 0) +
    (filters.propertyTypes.length > 0 ? 1 : 0) +
    (filters.minRating !== null ? 1 : 0);

  const results = useMemo(() => {
    const min = filters.minPrice ? Number(filters.minPrice) : null;
    const max = filters.maxPrice ? Number(filters.maxPrice) : null;
    const locationQuery = filters.location;

    let filtered = hotels.filter((hotel) => {
      if (!matchesLocation(hotel, locationQuery)) return false;

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
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Search stays</h1>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort stays"
          className="max-w-[60%] cursor-pointer rounded-lg border border-border/10 bg-surface px-3 py-2 text-sm"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="w-full md:w-64 md:shrink-0 md:self-start">
          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            aria-controls="search-filters"
            className="flex w-full items-center justify-between rounded-card border border-black/5 bg-surface px-5 py-3 text-sm font-semibold md:hidden"
          >
            <span>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </span>
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${showFilters ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div
            id="search-filters"
            className={`${showFilters ? "anim-fade-in mt-3 block" : "hidden"} md:mt-0 md:block`}
          >
            <FilterPanel filters={filters} onChange={setFilters} />
          </div>
        </div>

        {results.length > 0 ? (
          <div className="grid min-w-0 flex-1 grid-cols-1 content-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
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