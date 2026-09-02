import { SHELL_MAX_5XL } from "./contentShells";
import { PageSkeletonFrame, Skeleton } from "./primitives";

/** Skeleton aligned to Go Engine page geometry */
export function GoEnginePageSkeleton({ className }) {
  return (
    <PageSkeletonFrame
      className={className ?? `${SHELL_MAX_5XL} gap-4 sm:gap-6`}
      label="Loading Go Engine"
    >
      <div className="rounded-[14px] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg sm:w-28" />
          ))}
        </div>
      </div>

      <div className="rounded-[14px] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-soft)]">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>

      <div className="rounded-[14px] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-soft)]">
        <Skeleton className="mb-4 h-5 w-36" />
        <Skeleton className="h-16 w-full" />
      </div>

      <div className="rounded-[14px] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-soft)]">
        <Skeleton className="mb-4 h-5 w-40" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      </div>
    </PageSkeletonFrame>
  );
}
