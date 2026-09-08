export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-ink/10 ${className}`} />
  );
}

export function HotelCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border/10 bg-surface">
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
