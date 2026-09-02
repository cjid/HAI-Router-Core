import { PageSkeletonFrame, Skeleton } from "./primitives";

/** Compact skeleton for analytics / stat-heavy sections */
export function DashboardStatsSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? "flex flex-col gap-4"} label="Loading stats">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-[14px]" />
      <Skeleton className="h-4 w-64" />
    </PageSkeletonFrame>
  );
}
