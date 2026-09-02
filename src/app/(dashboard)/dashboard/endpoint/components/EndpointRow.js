"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import { Input } from "@/shared/components";
import EndpointLabel from "./EndpointLabel";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, active, actions }) {
  return (
    <div className="flex items-stretch gap-2">
      <EndpointLabel active={active}>{label}</EndpointLabel>
      <Input value={url} readOnly className="flex-1 self-stretch font-mono text-sm justify-center [&>div.relative]:h-full" inputClassName="h-full min-h-[2.5rem]" />
      <button
        type="button"
        onClick={() => onCopy(url, copyId)}
        className="self-center p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary transition-colors shrink-0"
      >
        <MdiIcon name={copied === copyId ? "check" : "content_copy"} size={18} />
      </button>
      {actions}
    </div>
  );
}
