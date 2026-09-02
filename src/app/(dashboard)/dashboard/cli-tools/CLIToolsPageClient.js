"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import { useState, useEffect } from "react";
import { CliToolsSkeleton } from "@/shared/components";
import { useNavigationAbortSignal, isAbortError } from "@/shared/hooks/useNavigationAbort";
import { CLI_TOOLS, MITM_TOOLS } from "@/shared/constants/cliTools";
import { CliToolGrid } from "@/shared/components/skeleton/CliToolGrid";
import { MitmLinkCard } from "./components";
import ToolSummaryCard from "./components/ToolSummaryCard";

const ALL_STATUSES_URL = "/api/cli-tools/all-statuses";

export default function CLIToolsPageClient({ machineId }) {
  const [loading, setLoading] = useState(true);
  const [toolStatuses, setToolStatuses] = useState({});
  const navSignal = useNavigationAbortSignal();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(ALL_STATUSES_URL, { signal: navSignal });
        if (res.ok) setToolStatuses(await res.json());
      } catch (error) {
        if (isAbortError(error)) return;
        console.log("Error fetching tool statuses:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [navSignal]);

  if (loading) {
    return <CliToolsSkeleton />;
  }

  const regularTools = Object.entries(CLI_TOOLS);
  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-1 sm:px-0">
      <CliToolGrid>
        {regularTools.map(([toolId, tool]) => (
          <ToolSummaryCard key={toolId} toolId={toolId} tool={tool} status={toolStatuses[toolId]} />
        ))}
      </CliToolGrid>
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center gap-2 px-1">
          <MdiIcon name="security" size={18} className="text-primary" />
          <h2 className="text-sm font-semibold text-text-main">MITM Tools</h2>
        </div>
        <CliToolGrid>
          {mitmTools.map(([toolId, tool]) => (
            <MitmLinkCard key={toolId} tool={tool} />
          ))}
        </CliToolGrid>
      </div>
    </div>
  );
}
