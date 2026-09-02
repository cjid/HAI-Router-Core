import { SHELL_FULL_WIDTH } from "./contentShells";
import { PageSkeletonFrame, Skeleton } from "./primitives";

export function UsageSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_FULL_WIDTH} label="Loading usage">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
        <Skeleton className="h-8 w-56 rounded-lg" />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-[14px]" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" style={{ opacity: 1 - i * 0.06 }} />
        ))}
      </div>
    </PageSkeletonFrame>
  );
}

export function QuotaSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_FULL_WIDTH} label="Loading quota">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[14px] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-soft)]"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-2 w-full max-w-xs rounded-full sm:w-48" />
            </div>
          </div>
        ))}
      </div>
    </PageSkeletonFrame>
  );
}
