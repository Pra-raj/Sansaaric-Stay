import Destination from "@/components/home/Destination";
import HeroSlideShow from "@/components/home/HeroSlideShow";
import Recommendation from "@/components/home/Recommendation";

// Recommendation fetches live data — never bake it into the build.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div>
      <HeroSlideShow />
      <Recommendation />
      <Destination />
    </div>
  );
}
