import type { Hotel } from "@/types";
import { VideoCard } from "./VideoCard";

export function VideoFeed({ hotels }: { hotels: Hotel[] }) {
  return (
    <div className="h-[100dvh] snap-y snap-mandatory overflow-y-scroll md:h-auto md:snap-none md:space-y-4 md:overflow-visible md:p-4">
      {hotels.map((hotel) => (
        <VideoCard key={hotel.id} hotel={hotel} />
      ))}
    </div>
  );
}
