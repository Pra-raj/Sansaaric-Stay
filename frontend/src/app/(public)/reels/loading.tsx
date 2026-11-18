import { Skeleton } from "@/components/ui/Skeleton";

export default function ReelsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="lg:mx-auto lg:max-w-lg">
        <Skeleton className="aspect-[9/16] h-[calc(100dvh-15rem)] min-h-[320px] w-full rounded-card lg:aspect-auto lg:h-[75vh]" />
      </div>
    </div>
  );
}
