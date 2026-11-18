import Destination from "@/components/home/Destination";
import HeroSlideShow from "@/components/home/HeroSlideShow";
import Recommendation from "@/components/home/Recommendation";
import ReelsStrip from "@/components/home/ReelsStrip";

// Recommendation fetches live data — never bake it into the build.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div>
      <HeroSlideShow />
      <Recommendation />
      <ReelsStrip />
      <Destination />
    </div>
  );
}
