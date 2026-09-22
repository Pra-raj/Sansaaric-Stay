import { Badge } from "../ui/Badge";
import Input from "../ui/Input";

export interface Filters {
  location: string;
  minPrice: string;
  maxPrice: string;
  propertyTypes: string[];
  minRating: number | null;
}

const propertyTypeOptions = ["Hotel", "Resort", "Homestay"];
const ratingOptions = [4.5, 4.0, 3.5];

export function FilterPanel({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  function toggleType(type: string) {
    const has = filters.propertyTypes.includes(type);
    onChange({
      ...filters,
      propertyTypes: has
        ? filters.propertyTypes.filter((t) => t !== type)
        : [...filters.propertyTypes, type],
    });
  }

  const minNum = Number(filters.minPrice);
  const maxNum = Number(filters.maxPrice);
  const rangeInvalid =
    (filters.minPrice !== "" && (isNaN(minNum) || minNum < 0)) ||
    (filters.maxPrice !== "" && (isNaN(maxNum) || maxNum < 0)) ||
    (filters.minPrice !== "" &&
      filters.maxPrice !== "" &&
      minNum > maxNum);
  const rangeError = rangeInvalid
    ? "Enter a valid range (min below max, no negatives)."
    : "";

  return (
    <aside className="w-full shrink-0 space-y-6 rounded-card border border-black/5 bg-surface p-5 sm:w-64">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Location</h3>
        <Input
          id="filter-location"
          label="Where to?"
          placeholder="Pokhara, Kathmandu..."
          value={filters.location}
          onChange={(e) => onChange({ ...filters, location: e.target.value })}
        />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">
          Price Range (NPR / night)
        </h3>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              id="filter-min"
              label="Min"
              type="number"
              min={0}
              placeholder="1000"
              value={filters.minPrice}
              onChange={(e) =>
                onChange({ ...filters, minPrice: e.target.value })
              }
            />
          </div>
          <span className="pt-6 text-ink-soft">–</span>
          <div className="min-w-0 flex-1">
            <Input
              id="filter-max"
              label="Max"
              type="number"
              min={0}
              placeholder="6000"
              value={filters.maxPrice}
              onChange={(e) =>
                onChange({ ...filters, maxPrice: e.target.value })
              }
            />
          </div>
        </div>
        {rangeError && (
          <p className="mt-2 text-xs font-medium text-red-600">{rangeError}</p>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Property type</h3>
        <div className="space-y-2">
          {propertyTypeOptions.map((type) => (
            <label
              key={type}
              className="flex items-center gap-2 text-sm text-ink-soft"
            >
              <input
                type="checkbox"
                checked={filters.propertyTypes.includes(type)}
                onChange={() => toggleType(type)}
                className="h-4 w-4 rounded border-black/20"
              />
              {type}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Guest rating</h3>
        <div className="flex flex-wrap gap-2">
          {ratingOptions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() =>
                onChange({
                  ...filters,
                  minRating: filters.minRating === r ? null : r,
                })
              }
            >
              <Badge
                tone={filters.minRating === r ? "brand" : "neutral"}
              >
                {r.toFixed(1)}+
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {(filters.location ||
        filters.minPrice ||
        filters.maxPrice ||
        filters.propertyTypes.length > 0 ||
        filters.minRating) && (
        <button
          type="button"
          onClick={() =>
            onChange({
              location: "",
              minPrice: "",
              maxPrice: "",
              propertyTypes: [],
              minRating: null,
            })
          }
          className="text-sm font-semibold text-brand-600 hover:underline"
        >
          Clear all filters
        </button>
      )}
    </aside>
  );
}