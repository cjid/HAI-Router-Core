"use client";

import { APP_CONFIG, GITHUB_CONFIG } from "@/shared/constants/config";
import { LEGACY_ATTRIBUTION } from "@/shared/constants/product";

/**
 * Shared footer attribution — only user-visible 9Router reference.
 * Format: HAI-Router Version {current} · Originally based on 9Router V{upstream}
 */
export default function FooterAttribution({
  className = "",
  linkClassName = "hover:text-primary",
}) {
  return (
    <>
      {APP_CONFIG.productName} Version {APP_CONFIG.version} · Originally based on{" "}
      <a
        href={GITHUB_CONFIG.upstreamRepoUrl}
        target="_blank"
        rel="noreferrer"
        className={linkClassName}
      >
        {LEGACY_ATTRIBUTION.name} V{LEGACY_ATTRIBUTION.version}
      </a>
    </>
  );
}
