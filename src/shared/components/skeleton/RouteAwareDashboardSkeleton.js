"use client";

import { usePathname } from "next/navigation";
import { resolveRouteSkeleton } from "./routeSkeleton";

export default function RouteAwareDashboardSkeleton() {
  const pathname = usePathname();
  const SkeletonComponent = resolveRouteSkeleton(pathname);
  return <SkeletonComponent />;
}
