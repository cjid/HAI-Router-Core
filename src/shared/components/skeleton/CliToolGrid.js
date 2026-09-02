import { cn } from "@/shared/utils/cn";

/** Same grid geometry as CLI Tools page tool cards */
export const CLI_TOOL_GRID_CLASS =
  "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4";

export function CliToolGrid({ children, className }) {
  return <div className={cn(CLI_TOOL_GRID_CLASS, className)}>{children}</div>;
}
