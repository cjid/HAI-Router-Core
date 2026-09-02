"use client";

import Image from "next/image";
import PropTypes from "prop-types";
import { BRANDING } from "@/shared/constants/branding";
import { APP_CONFIG } from "@/shared/constants/config";
import { cn } from "@/shared/utils/cn";

/**
 * @param {"mark" | "full"} variant - Icon mark or full HarumAI lockup
 * @param {boolean} showName - Show HAI-Router product name beside mark
 * @param {boolean} showTagline - Show HarumAI tagline under name
 * @param {number} markSize - Mark width/height in px
 */
export default function BrandLogo({
  variant = "mark",
  showName = false,
  showTagline = false,
  markSize = 36,
  className,
  nameClassName,
}) {
  if (variant === "full") {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <Image
          src={BRANDING.logoSrc}
          alt={`${BRANDING.companyName} — ${APP_CONFIG.productName}`}
          width={320}
          height={160}
          priority
          className="h-auto w-full max-w-[280px] object-contain"
        />
      </div>
    );
  }

  const mark = (
    <Image
      src={BRANDING.markSrc}
      alt={APP_CONFIG.productName}
      width={markSize}
      height={markSize}
      priority
      className="rounded-[10px] object-contain"
      style={{ width: markSize, height: markSize }}
    />
  );

  if (!showName) {
    return <div className={className}>{mark}</div>;
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {mark}
      <div className="flex min-w-0 flex-col">
        <span className={cn("text-lg font-semibold tracking-tight text-text-main", nameClassName)}>
          {APP_CONFIG.productName}
        </span>
        {showTagline ? (
          <span className="truncate text-[11px] text-text-muted">{BRANDING.tagline}</span>
        ) : null}
      </div>
    </div>
  );
}

BrandLogo.propTypes = {
  variant: PropTypes.oneOf(["mark", "full"]),
  showName: PropTypes.bool,
  showTagline: PropTypes.bool,
  markSize: PropTypes.number,
  className: PropTypes.string,
  nameClassName: PropTypes.string,
};
