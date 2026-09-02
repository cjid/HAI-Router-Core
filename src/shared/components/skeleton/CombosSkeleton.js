import { SHELL_FULL_WIDTH } from "./contentShells";
import { PageSkeletonFrame, Skeleton, SkeletonButton } from "./primitives";

function ComboRowSkeleton() {
  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
  );
}

export function CombosSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_FULL_WIDTH} label="Loading combos">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-3 w-full max-w-xl" />
          <Skeleton className="h-3 w-[90%] max-w-lg" />
          <Skeleton className="h-3 w-[80%] max-w-md" />
        </div>
        <SkeletonButton className="w-36 shrink-0" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <ComboRowSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-[14px] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-soft)]">
        <Skeleton className="mb-4 h-5 w-44" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    </PageSkeletonFrame>
  );
}
