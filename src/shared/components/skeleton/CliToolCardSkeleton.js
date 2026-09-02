import { Skeleton, SkeletonBadge, SkeletonIcon } from "./primitives";

/** Approximates ToolSummaryCard / MitmLinkCard geometry */
export function CliToolCardSkeleton() {
  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <SkeletonIcon />
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <Skeleton className="h-3.5 w-24 max-w-[75%]" />
          <SkeletonBadge className="h-4 w-20" />
        </div>
        <Skeleton className="size-4 shrink-0 rounded" />
      </div>
    </div>
  );
}
