import { CLI_TOOLS, MITM_TOOLS } from "@/shared/constants/cliTools";
import { SHELL_MAX_5XL } from "./contentShells";
import { CliToolGrid } from "./CliToolGrid";
import { CliToolCardSkeleton } from "./CliToolCardSkeleton";
import { CliToolDetailContentSkeleton } from "./CliToolDetailContentSkeleton";
import { PageSkeletonFrame, SkeletonSectionTitle } from "./primitives";

const REGULAR_COUNT = Math.min(Object.keys(CLI_TOOLS).length, 18);
const MITM_COUNT = Object.keys(MITM_TOOLS).length;

export function CliToolsSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_MAX_5XL} label="Loading CLI tools">
      <CliToolGrid>
        {Array.from({ length: REGULAR_COUNT }).map((_, i) => (
          <CliToolCardSkeleton key={`cli-${i}`} />
        ))}
      </CliToolGrid>

      <div className="flex flex-col gap-3 sm:gap-4">
        <SkeletonSectionTitle />
        <CliToolGrid>
          {Array.from({ length: MITM_COUNT }).map((_, i) => (
            <CliToolCardSkeleton key={`mitm-${i}`} />
          ))}
        </CliToolGrid>
      </div>
    </PageSkeletonFrame>
  );
}

export function CliToolDetailRouteSkeleton({ className }) {
  return (
    <PageSkeletonFrame className={className ?? SHELL_MAX_5XL} label="Loading CLI tool">
      <CliToolDetailContentSkeleton />
    </PageSkeletonFrame>
  );
}
