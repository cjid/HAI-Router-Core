"use client";

import PropTypes from "prop-types";
import CompactModelRow from "./CompactModelRow";

export default function ModelPickerRow({
  model,
  group,
  providerId,
  selected = false,
  disabled = false,
  onClick,
}) {
  const meta = model.meta;
  const displayName = meta?.displayName || model.name || model.id;
  const modelValue = model.value || `${group?.alias}/${model.id}`;

  return (
    <CompactModelRow
      variant="picker"
      modelValue={modelValue}
      meta={meta}
      displayName={displayName}
      providerId={providerId}
      group={group}
      selected={selected}
      disabled={disabled || model.isPlaceholder}
      onClick={onClick}
    />
  );
}

ModelPickerRow.propTypes = {
  model: PropTypes.object.isRequired,
  group: PropTypes.object,
  providerId: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
};
