import { SHELL_FULL_WIDTH } from "./contentShells";
import { PageSkeletonFrame, Skeleton } from "./primitives";

/**
 * Generic fallback when no route-specific skeleton exists.
 * Intentionally minimal — no fake sidebar or dashboard chart blocks.
 */
export function GenericPageSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_FULL_WIDTH} label="Loading page">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-48 max-w-[60%]" />
        <Skeleton className="h-2.5 w-full max-w-2xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-32 rounded-[14px]" />
          <Skeleton className="h-32 rounded-[14px]" />
        </div>
        <Skeleton className="h-24 w-full rounded-[14px]" />
      </div>
    </PageSkeletonFrame>
  );
}

/** @deprecated Use route-specific skeletons or GenericPageSkeleton */
export const DashboardPageSkeleton = GenericPageSkeleton;
