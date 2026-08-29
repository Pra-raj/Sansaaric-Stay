import { CalendarDays, MapPin, Search, Users } from "lucide-react";

function BookingSearch() {
  return (
    <form
      action="/search"
      className="relative mx-auto mt-8 grid w-full max-w-4xl grid-cols-1 rounded-4xl border border-brand-100 bg-surface p-2 text-left shadow-xl lg:grid-cols-[1.45fr_1fr_1fr_auto]"
    >
      <label className="flex min-h-16 items-center gap-3 border-b border-brand-100 px-4 lg:border-b-0 lg:border-r">
        <MapPin
          className="h-4 w-4 shrink-0 text-brand-600"
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            Where
          </span>
          <input
            name="q"
            type="text"
            placeholder="Search destinations"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
          />
        </span>
      </label>
      <label className="flex min-h-16 items-center gap-3 border-b border-brand-100 px-4 lg:border-b-0 lg:border-r">
        <CalendarDays
          className="h-4 w-4 shrink-0 text-brand-600"
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            Check in
          </span>
          <input
            name="checkIn"
            type="date"
            aria-label="Check in date"
            className="w-full bg-transparent text-sm text-ink outline-none"
          />
        </span>
      </label>
      <label className="flex min-h-16 items-center gap-3 px-4">
        <Users className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            Guests
          </span>
          <input
            name="guests"
            type="number"
            min="1"
            defaultValue="2"
            className="w-full bg-transparent text-sm text-ink outline-none"
          />
        </span>
      </label>
      <button
        type="submit"
        className="flex min-h-16 items-center justify-center gap-2 rounded-4xl bg-brand-600 px-7 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
        Search
      </button>
    </form>
  );
}

export default BookingSearch;
