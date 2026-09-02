import { cn } from "@/shared/utils/cn";

/** Single shimmer block — visual SSOT for all page skeletons */
export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("shimmer-block rounded-[10px]", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonText({ className, width = "w-full" }) {
  return <Skeleton className={cn("h-2.5", width, className)} />;
}

export function SkeletonIcon({ className, size = "size-8" }) {
  return <Skeleton className={cn("shrink-0 rounded-lg", size, className)} />;
}

export function SkeletonButton({ className }) {
  return <Skeleton className={cn("h-9 w-24 rounded-lg", className)} />;
}

export function SkeletonBadge({ className }) {
  return <Skeleton className={cn("h-5 w-16 rounded-full", className)} />;
}

export function PageSkeletonFrame({ className, children, label = "Loading page" }) {
  return (
    <div className={cn(className)} aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

export function SkeletonSectionTitle({ className }) {
  return (
    <div className={cn("flex items-center gap-2 px-1", className)}>
      <SkeletonIcon size="size-[18px]" className="rounded" />
      <Skeleton className="h-3.5 w-28" />
    </div>
  );
}
