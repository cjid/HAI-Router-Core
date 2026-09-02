import { SHELL_MAX_5XL } from "./contentShells";
import { PageSkeletonFrame, Skeleton, SkeletonBadge, SkeletonButton } from "./primitives";

function ProxyPoolRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Skeleton className="size-4 shrink-0 rounded" />
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <SkeletonBadge className="h-6 w-14" />
        <SkeletonButton className="h-8 w-16" />
      </div>
    </div>
  );
}

export function ProxyPoolsSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_MAX_5XL} label="Loading proxy pools">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Skeleton className="h-7 w-36" />
        <div className="flex flex-wrap gap-2">
          <SkeletonButton className="w-28" />
          <SkeletonButton className="w-28" />
          <SkeletonButton className="w-36" />
        </div>
      </div>

      <div className="rounded-[14px] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Skeleton className="size-4 rounded" />
          <SkeletonBadge />
          <SkeletonBadge className="w-24" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProxyPoolRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </PageSkeletonFrame>
  );
}
