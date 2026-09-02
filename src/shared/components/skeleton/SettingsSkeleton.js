import { SHELL_SETTINGS } from "./contentShells";
import { PageSkeletonFrame, Skeleton, SkeletonButton, SkeletonIcon } from "./primitives";

function SettingsSectionSkeleton() {
  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface p-4 sm:p-6 shadow-[var(--shadow-soft)] flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <SkeletonIcon size="size-10" />
        <div className="flex-1 flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function SettingsSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_SETTINGS} label="Loading settings">
      {Array.from({ length: 4 }).map((_, i) => (
        <SettingsSectionSkeleton key={i} />
      ))}
      <div className="flex justify-end gap-2">
        <SkeletonButton className="w-24" />
        <SkeletonButton className="w-28" />
      </div>
    </PageSkeletonFrame>
  );
}
