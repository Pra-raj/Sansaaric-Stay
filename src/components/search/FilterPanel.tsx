import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import Input from "../ui/Input";

const propertyTypes = ["Hotel", "Resort", "Homestay"];

export function FilterPanel({ initialLocation }: { initialLocation?: string }) {
  return (
    <aside className="w-full shrink-0 space-y-6 rounded-card border-black/5 bg-surface p-5 sm:w-64">
      <div>
        <h3 className="ms-3 text-sm font-semibold"> Location </h3>
        <Input
          id="filter-location"
          label="Where to?"
          placeholder="Pokhara, Kathmandu..."
          defaultValue={initialLocation}
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
              placeholder="1000"
            />
          </div>
          <span className="pt-6 text-ink-soft">-</span>
          <div className="min-w-0 flex-1">
            <Input
              id="filter-max"
              label="Max"
              type="number"
              placeholder="6000"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Property type</h3>
        <div className="space-y-2">
          {propertyTypes.map((type) => (
            <label
              key={type}
              className="flex items-center gap-2 text-sm text-ink-soft"
            >
              <input
                type="checkbox"
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
          {["4.5+", "4.0+", "3.5+"].map((r) => (
            <Badge key={r} tone="neutral">
              {r}
            </Badge>
          ))}
        </div>
      </div>

      <Button fullWidth> Apply filters</Button>
    </aside>
  );
}
