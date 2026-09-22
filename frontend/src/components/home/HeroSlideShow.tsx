import BookingSearch from "@/components/home/BookingSearch";

function HeroSlideShow() {
  return (
    <section className="relative flex min-h-[560px] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-brand-700 via-brand-600 to-brand-500 px-4 py-12 text-white md:min-h-[600px] lg:min-h-[480px] lg:px-0 lg:py-0">
      <div className="absolute inset-0 flex items-center justify-center text-white/30">
        <span className="text-sm">
          This is where videos, Slide Shows and offer Are dispalyed
        </span>
      </div>
      <div className="relative mx-auto w-full max-w-3xl px-6 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">
          Find your next stay in Nepal
        </h1>
        <BookingSearch />
      </div>
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
        {[0, 1, 2].map((n) => (
          <span
            key={n}
            className={`h-1.5 w-1.5 rounded-full ${n === 0 ? "bg-white" : "bg-white/40"}`}
          />
        ))}
      </div>
    </section>
  );
}

export default HeroSlideShow;
