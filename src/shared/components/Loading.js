"use client";

import MdiIcon from "@/shared/components/MdiIcon";
import { cn } from "@/shared/utils/cn";
import { mainPanelOverlayClass } from "@/shared/utils/overlayScope";
import {
  Skeleton,
  DashboardPageSkeleton,
  DashboardStatsSkeleton,
  GenericPageSkeleton,
  GoEnginePageSkeleton,
} from "./skeleton";

export { Skeleton, DashboardPageSkeleton, DashboardStatsSkeleton, GenericPageSkeleton, GoEnginePageSkeleton };

export function Spinner({ size = "md", className }) {
  const px = size === "sm" ? 16 : size === "md" ? 24 : size === "lg" ? 32 : 48;
  return (
    <MdiIcon name="progress_activity" size={px} spin className={cn("text-brand-500", className)} />
  );
}

export function PageLoading({ message = "Loading..." }) {
  return (
    <div className={cn(mainPanelOverlayClass(), "flex flex-col items-center justify-center bg-bg")}>
      <Spinner size="xl" />
      <p className="mt-4 text-text-muted">{message}</p>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-10 rounded-[10px]" />
      </div>
      <Skeleton className="mb-2 h-8 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export default function Loading({ type = "spinner", ...props }) {
  switch (type) {
    case "page":
      return <PageLoading {...props} />;
    case "skeleton":
      return <Skeleton {...props} />;
    case "card":
      return <CardSkeleton {...props} />;
    case "dashboard":
      return <DashboardPageSkeleton {...props} />;
    case "go-engine":
      return <GoEnginePageSkeleton {...props} />;
    case "stats":
      return <DashboardStatsSkeleton {...props} />;
    default:
      return <Spinner {...props} />;
  }
}
