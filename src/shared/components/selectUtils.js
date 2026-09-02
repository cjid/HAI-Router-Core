/** @typedef {{ value: string | number | boolean, label: string, description?: string, disabled?: boolean, icon?: string }} SelectOption */

/**
 * Normalize options from string[] or { value, label }[].
 * @param {Array<string | SelectOption>} options
 * @returns {SelectOption[]}
 */
export function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((opt) => {
    if (opt == null) return { value: "", label: "" };
    if (typeof opt === "string" || typeof opt === "number" || typeof opt === "boolean") {
      const v = opt;
      return { value: v, label: String(v) };
    }
    return {
      value: opt.value,
      label: opt.label ?? String(opt.value ?? ""),
      description: opt.description,
      disabled: opt.disabled,
      icon: opt.icon,
    };
  });
}

/**
 * @param {SelectOption[]} options
 * @param {unknown} value
 */
export function findSelectedOption(options, value) {
  return options.find((o) => valuesEqual(o.value, value)) ?? null;
}

/** Loose equality for string/number/boolean option values. */
export function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return String(a) === String(b);
}

/**
 * Filter options by search query (label + description).
 * @param {SelectOption[]} options
 * @param {string} query
 */
export function filterOptions(options, query) {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => {
    const label = (o.label || "").toLowerCase();
    const desc = (o.description || "").toLowerCase();
    return label.includes(q) || desc.includes(q);
  });
}

/**
 * Compute fixed menu position from trigger rect.
 * @param {DOMRect} rect
 * @param {{ maxMenuHeight?: number, gap?: number }} [opts]
 */
export function computeMenuPosition(rect, opts = {}) {
  const maxMenuHeight = opts.maxMenuHeight ?? 320;
  const gap = opts.gap ?? 6;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;
  const spaceBelow = viewportH - rect.bottom;
  const spaceAbove = rect.top;
  const placement = spaceBelow >= 160 || spaceBelow >= spaceAbove ? "bottom" : "top";
  const available = placement === "bottom" ? spaceBelow - gap : spaceAbove - gap;
  const maxHeight = Math.max(120, Math.min(maxMenuHeight, available));
  const minWidth = rect.width;
  const left = Math.min(Math.max(8, rect.left), viewportW - minWidth - 8);

  return {
    placement,
    top: placement === "bottom" ? rect.bottom + gap : rect.top - gap,
    left,
    minWidth,
    maxHeight,
  };
}
