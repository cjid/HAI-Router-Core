"use client";

import Select from "@/shared/components/Select";
import PropTypes from "prop-types";
import { useMemo } from "react";

const THINKING_LABELS = {
  auto: { title: "Auto", description: "Let HAI-Router decide reasoning level" },
  minimal: { title: "Minimal", description: "Lowest reasoning effort" },
  low: { title: "Low", description: "Low reasoning effort" },
  medium: { title: "Medium", description: "Balanced reasoning effort" },
  high: { title: "High", description: "Higher reasoning effort" },
  xhigh: { title: "XHigh", description: "Extra-high reasoning effort" },
  max: { title: "Max", description: "Maximum reasoning effort" },
  thinking: { title: "Thinking", description: "Extended thinking mode" },
};

function labelForOption(opt) {
  const key = String(opt || "").toLowerCase();
  return THINKING_LABELS[key]?.title || opt.charAt(0).toUpperCase() + opt.slice(1);
}

export default function ThinkingModeSelect({ value, options, onChange, disabled }) {
  const selectOptions = useMemo(
    () =>
      (options || []).map((opt) => {
        const meta = THINKING_LABELS[String(opt).toLowerCase()];
        return {
          value: opt,
          label: labelForOption(opt),
          description: meta?.description,
        };
      }),
    [options],
  );

  if (!options?.length) return null;

  return (
    <Select
      variant="descriptive"
      icon="psychology"
      triggerLabel="Thinking"
      menuTitle="Thinking"
      hideLabelOnMobile
      value={value}
      options={selectOptions}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

ThinkingModeSelect.propTypes = {
  value: PropTypes.string,
  options: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
