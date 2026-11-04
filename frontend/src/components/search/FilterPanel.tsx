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
export const MIN_PRICE = 250;
export const MAX_PRICE = 100000;
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
  // Digits only, never above NPR 1,00,000 (typing a bigger number is cut back).
  const cleanPrice = (v: string) => {
    const digits = v.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    return digits !== "" && Number(digits) > MAX_PRICE ? String(MAX_PRICE) : digits;
  };
  let rangeError = "";
  if (filters.minPrice !== "" && minNum < MIN_PRICE) {
    rangeError = `Minimum price is NPR ${MIN_PRICE}.`;
  } else if (filters.maxPrice !== "" && maxNum < MIN_PRICE) {
    rangeError = `Maximum price must be at least NPR ${MIN_PRICE}.`;
  } else if (filters.minPrice !== "" && filters.maxPrice !== "" && minNum > maxNum) {
    rangeError = "Minimum must be lower than maximum.";
  }

  return (
    <aside className="w-full space-y-6 rounded-card border border-black/5 bg-surface p-5">
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
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder={String(MIN_PRICE)}
              value={filters.minPrice}
              error={filters.minPrice !== "" && minNum < MIN_PRICE}
              onChange={(e) =>
                onChange({ ...filters, minPrice: cleanPrice(e.target.value) })
              }
            />
          </div>
          <span className="pt-6 text-ink-soft">–</span>
          <div className="min-w-0 flex-1">
            <Input
              id="filter-max"
              label="Max"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="100000"
              value={filters.maxPrice}
              error={filters.maxPrice !== "" && maxNum < MIN_PRICE}
              onChange={(e) =>
                onChange({ ...filters, maxPrice: cleanPrice(e.target.value) })
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