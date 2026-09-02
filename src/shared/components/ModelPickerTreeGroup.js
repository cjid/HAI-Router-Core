"use client";

import PropTypes from "prop-types";

/** Tree connectors — theme-neutral, visible on light/dark surfaces */
const TREE_LINE = "border-text-muted/50";

/**
 * Provider → models tree for Add Models picker.
 * Logo/icon only on the header row; children are indented with branch lines.
 */
export default function ModelPickerTreeGroup({
  header,
  items = [],
  renderItem,
  empty = false,
  emptyMessage = "No active models available",
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-h-8 items-center gap-2 py-1">{header}</div>

      {empty ? (
        <p className="py-1 pl-6 text-xs text-text-muted">{emptyMessage}</p>
      ) : (
        <div className={`relative ml-[13px] border-l-2 py-2 ${TREE_LINE}`}>
          <div className="flex flex-col gap-1.5">
            {items.map((item, index) => (
              <div key={item.key ?? index} className="relative pl-3">
                <span
                  className={`pointer-events-none absolute left-0 top-[18px] w-3.5 border-t-2 ${TREE_LINE}`}
                  aria-hidden
                />
                {renderItem(item, index)}
              </div>
            ))}
          </div>
          <span
            className={`pointer-events-none absolute bottom-0 left-0 right-0 border-b-2 ${TREE_LINE}`}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}

ModelPickerTreeGroup.propTypes = {
  header: PropTypes.node.isRequired,
  items: PropTypes.array,
  renderItem: PropTypes.func.isRequired,
  empty: PropTypes.bool,
  emptyMessage: PropTypes.string,
};
