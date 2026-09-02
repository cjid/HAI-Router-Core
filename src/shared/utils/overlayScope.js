import { cn } from "@/shared/utils/cn";

/** Desktop sidebar width matches Tailwind `w-72`. */
export const DASHBOARD_SIDEBAR_WIDTH_CLASS = "lg:left-72";

/**
 * Full-screen overlay scoped to the dashboard main panel (sidebar stays clickable on desktop).
 */
export function mainPanelOverlayClass(extra = "") {
  return cn(
    "fixed inset-0 z-50",
    DASHBOARD_SIDEBAR_WIDTH_CLASS,
    "lg:inset-y-0 lg:right-0",
    extra
  );
}
