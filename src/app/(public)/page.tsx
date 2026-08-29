import Destination from "@/components/home/Destination";
import HeroSlideShow from "@/components/home/HeroSlideShow";
import Recommendation from "@/components/home/Recommendation";

export default function HomePage() {
  return (
    <div>
      <HeroSlideShow />
      <Recommendation />
      <Destination />
    </div>
  );
}
