import { SHELL_FULL_WIDTH } from "./contentShells";
import { PageSkeletonFrame, Skeleton, SkeletonButton, SkeletonIcon } from "./primitives";

const PROVIDER_GRID =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4";

function ProviderCardSkeleton() {
  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <SkeletonIcon size="size-10" />
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="mt-4 h-8 w-full rounded-lg" />
    </div>
  );
}

export function ProvidersSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_FULL_WIDTH} label="Loading providers">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-6 w-64 max-w-[80%]" />
          <div className="flex gap-2">
            <SkeletonButton className="w-36" />
            <SkeletonButton className="w-40" />
          </div>
        </div>
        <div className={PROVIDER_GRID}>
          {Array.from({ length: 8 }).map((_, i) => (
            <ProviderCardSkeleton key={i} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <div className={PROVIDER_GRID}>
          {Array.from({ length: 6 }).map((_, i) => (
            <ProviderCardSkeleton key={`oauth-${i}`} />
          ))}
        </div>
      </div>
    </PageSkeletonFrame>
  );
}
