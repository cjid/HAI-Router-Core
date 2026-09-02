import { Skeleton, SkeletonButton, SkeletonIcon } from "./primitives";

/** Tool detail: only the async card body (header/back link stay visible) */
export function CliToolDetailContentSkeleton() {
  return (
    <div
      className="rounded-[14px] border border-border-subtle bg-surface p-4 sm:p-6 shadow-[var(--shadow-soft)] flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading tool configuration"
    >
      <div className="flex items-center gap-3">
        <SkeletonIcon size="size-10" />
        <div className="flex-1 flex flex-col gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-52 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="flex flex-wrap gap-2 pt-2">
        <SkeletonButton className="w-28" />
        <SkeletonButton className="w-32" />
      </div>
    </div>
  );
}
