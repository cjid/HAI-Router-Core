"use client";

import PropTypes from "prop-types";
import CompactModelRow from "./CompactModelRow";
import { cn } from "@/shared/utils/cn";

/** Compact preview row for combo cards and adapter chips */
export default function ComboModelSummary({
  modelValue,
  modelAliases = {},
  className,
  showProvider = true,
  order,
  trailing,
}) {
  return (
    <CompactModelRow
      variant="preview"
      modelValue={modelValue}
      modelAliases={modelAliases}
      order={order}
      showProvider={showProvider}
      trailing={trailing}
      className={cn(className)}
    />
  );
}

ComboModelSummary.propTypes = {
  modelValue: PropTypes.string.isRequired,
  modelAliases: PropTypes.object,
  className: PropTypes.string,
  showProvider: PropTypes.bool,
  order: PropTypes.number,
  trailing: PropTypes.node,
};
