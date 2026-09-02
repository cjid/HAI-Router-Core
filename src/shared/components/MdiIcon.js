"use client";

import Icon from "@mdi/react";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";
import { resolveMdiPath } from "@/shared/icons/mdiIconRegistry";

const MDI_BASE = 24;
const DEFAULT_SIZE = 18;

/** Normalized table glyph size — 20px (@mdi/react uses 24px base × size). */
export const TABLE_MDI_SIZE = 20 / MDI_BASE;

/**
 * HAI-Router UI icon SSOT — MDI only.
 * Pass `name` (legacy Material Symbols id) or raw `path` from @mdi/js.
 */
export default function MdiIcon({
  name,
  path,
  size = DEFAULT_SIZE,
  className,
  spin = false,
  title,
  ...rest
}) {
  const resolved = path || resolveMdiPath(name);
  if (!resolved) {
    if (process.env.NODE_ENV !== "production" && name) {
      console.warn(`[MdiIcon] Unknown icon name: "${name}"`);
    }
    return null;
  }

  const shouldSpin = Boolean(spin);

  return (
    <Icon
      path={resolved}
      size={size / MDI_BASE}
      title={title}
      className={cn("inline-block shrink-0", shouldSpin && "animate-spin", className)}
      {...rest}
    />
  );
}

MdiIcon.propTypes = {
  name: PropTypes.string,
  path: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  spin: PropTypes.bool,
  title: PropTypes.string,
};

/** Compact MDI glyph for dense data tables (20px). */
export function TableMdi({ path, name, className, ...rest }) {
  return (
    <MdiIcon
      path={path}
      name={name}
      size={20}
      className={className}
      {...rest}
    />
  );
}

TableMdi.propTypes = {
  path: PropTypes.string,
  name: PropTypes.string,
  className: PropTypes.string,
};
