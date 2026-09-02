import { SHELL_ENDPOINT } from "./contentShells";
import { DashboardStatsSkeleton } from "./DashboardStatsSkeleton";
import { PageSkeletonFrame, Skeleton } from "./primitives";

export function EndpointSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_ENDPOINT} label="Loading dashboard">
      <DashboardStatsSkeleton />
      <div className="rounded-[14px] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-soft)]">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-stretch gap-2">
              <Skeleton className="h-10 w-16 shrink-0 rounded-lg" />
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="size-10 shrink-0 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[14px] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-soft)]">
        <Skeleton className="mb-4 h-5 w-28" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-12 w-full rounded-lg" />
        ))}
      </div>
    </PageSkeletonFrame>
  );
}
