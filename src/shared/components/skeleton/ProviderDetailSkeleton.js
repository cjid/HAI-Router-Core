import { SHELL_FULL_WIDTH } from "./contentShells";
import { PageSkeletonFrame, Skeleton, SkeletonButton, SkeletonIcon } from "./primitives";

function ModelCatalogTableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
        <div className="flex gap-2">
          <SkeletonButton />
          <SkeletonButton className="w-20" />
        </div>
      </div>
      <div className="flex gap-2 overflow-hidden">
        {["w-[22%]", "w-[14%]", "w-[12%]", "w-[10%]", "w-[12%]", "w-[10%]", "w-[12%]"].map((w, i) => (
          <Skeleton key={i} className={`h-3 shrink-0 ${w}`} />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" style={{ opacity: 1 - i * 0.05 }} />
      ))}
    </div>
  );
}

export function ProviderDetailSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_FULL_WIDTH} label="Loading provider">
      <Skeleton className="h-4 w-32" />
      <div className="flex items-center gap-4">
        <SkeletonIcon size="size-12" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Skeleton className="h-48 rounded-[14px]" />
        <Skeleton className="h-48 rounded-[14px]" />
      </div>
      <ModelCatalogTableSkeleton />
    </PageSkeletonFrame>
  );
}

export function ModelCatalogSkeleton() {
  return <ModelCatalogTableSkeleton />;
}
