"use client";

import MdiIcon from "@/shared/components/MdiIcon";
import { cn } from "@/shared/utils/cn";
import PropTypes from "prop-types";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  computeMenuPosition,
  filterOptions,
  findSelectedOption,
  normalizeOptions,
  valuesEqual,
} from "./selectUtils";

const MENU_Z = 100;

const TRIGGER_CLASSES =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-surface px-3 text-sm transition-colors hover:border-primary/30 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-white/10 disabled:opacity-50 disabled:pointer-events-none";

const MENU_SHELL =
  "overflow-hidden rounded-xl border border-black/10 bg-surface shadow-2xl dark:border-white/10 custom-scrollbar motion-reduce:transition-none";

const MENU_ANIM =
  "animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none motion-reduce:opacity-100";

function emitChange(onChange, value, option) {
  if (!onChange) return;
  const synthetic = { target: { value }, currentTarget: { value } };
  onChange(synthetic, option);
}

function OptionRow({
  option,
  selected,
  showDescription,
  focused,
  onSelect,
  onHover,
  renderOption,
}) {
  const content = renderOption ? (
    renderOption(option, { selected, focused })
  ) : (
    <>
      <span className="flex w-full items-center gap-2">
        {selected ? (
          <MdiIcon name="check" size={16} />
        ) : option.icon ? (
          <MdiIcon name={option.icon} size={16} className="text-text-muted" />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="font-medium">{option.label}</span>
      </span>
      {showDescription && option.description ? (
        <span className="pl-6 text-[11px] text-text-muted">{option.description}</span>
      ) : null}
    </>
  );

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      disabled={option.disabled}
      onMouseEnter={onHover}
      onClick={() => !option.disabled && onSelect(option)}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors",
        option.disabled && "cursor-not-allowed opacity-50",
        !option.disabled && selected && "bg-primary/10 text-primary",
        !option.disabled && !selected && "text-text-main hover:bg-black/5 dark:hover:bg-white/5",
        focused && !selected && !option.disabled && "bg-black/[0.03] dark:bg-white/[0.04]",
      )}
    >
      {content}
    </button>
  );
}

export default function Select({
  label,
  triggerLabel,
  menuTitle,
  icon,
  options = [],
  value,
  onChange,
  placeholder = "Select…",
  error,
  hint,
  disabled = false,
  required = false,
  loading = false,
  loadError,
  onRetry,
  emptyMessage = "No options available",
  variant = "compact",
  searchable: searchableProp,
  fullWidth = false,
  size = "md",
  hideLabelOnMobile = false,
  hideTriggerLabel = false,
  className,
  triggerClassName,
  id: idProp,
  "aria-label": ariaLabel,
  renderOption,
  renderTriggerValue,
  ...props
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const listboxId = `${id}-listbox`;
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [menuPos, setMenuPos] = useState(null);
  const [mounted, setMounted] = useState(false);

  const normalized = useMemo(() => normalizeOptions(options), [options]);
  const hasDescriptions = normalized.some((o) => o.description);
  const searchable =
    searchableProp ?? (variant === "searchable" || normalized.length > 12);
  const showDescription = variant === "descriptive" || (variant === "compact" && hasDescriptions);

  const selected = findSelectedOption(normalized, value);
  const filtered = useMemo(
    () => (searchable && open ? filterOptions(normalized, search) : normalized),
    [normalized, searchable, open, search],
  );

  const enabledFiltered = useMemo(
    () => filtered.filter((o) => !o.disabled),
    [filtered],
  );

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    setMenuPos(computeMenuPosition(triggerRef.current.getBoundingClientRect()));
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (
        triggerRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch("");
      const idx = enabledFiltered.findIndex((o) => valuesEqual(o.value, value));
      setFocusedIndex(idx >= 0 ? idx : 0);
      requestAnimationFrame(() => {
        if (searchable) searchRef.current?.focus();
        else menuRef.current?.focus();
      });
    }
  }, [open, searchable]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => setOpen(false), []);

  const selectOption = useCallback(
    (option) => {
      emitChange(onChange, option.value, option);
      close();
    },
    [onChange, close],
  );

  const toggleOpen = () => {
    if (disabled || loading) return;
    setOpen((v) => !v);
  };

  const onTriggerKeyDown = (e) => {
    if (disabled || loading) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleOpen();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setFocusedIndex((i) => Math.min(i + 1, enabledFiltered.length - 1));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  };

  const onMenuKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, enabledFiltered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      const opt = enabledFiltered[focusedIndex];
      if (opt) selectOption(opt);
    } else if (e.key === "Tab") {
      close();
    }
  };

  const displayLabel = triggerLabel ?? label;
  const showInlineLabel = displayLabel && !hideTriggerLabel;
  const triggerValue = loading
    ? "Loading…"
    : selected?.label ?? placeholder;

  const triggerSizeClass = size === "sm" ? "h-8 text-xs px-2" : "h-9 text-sm px-3";
  const widthClass = fullWidth ? "w-full" : "w-auto";

  const menu = open && menuPos && mounted
    ? createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={menuTitle || displayLabel || ariaLabel || "Options"}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          style={{
            position: "fixed",
            zIndex: MENU_Z,
            top: menuPos.top,
            left: menuPos.left,
            minWidth: menuPos.minWidth,
            maxWidth: "min(96vw, 420px)",
            transform: menuPos.placement === "top" ? "translateY(-100%)" : undefined,
          }}
          className={cn(MENU_SHELL, MENU_ANIM, props.menuClassName)}
        >
          {menuTitle ? (
            <p className="px-3 py-2 text-xs font-semibold text-text-muted">{menuTitle}</p>
          ) : null}

          {searchable ? (
            <div className="border-b border-black/5 px-2 py-2 dark:border-white/5">
              <div className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.04]">
                <MdiIcon name="search" size={16} className="shrink-0 text-text-muted" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setFocusedIndex(0);
                  }}
                  placeholder="Search…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-text-main placeholder:text-text-muted focus:outline-none"
                  aria-label="Search options"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-text-muted hover:text-text-main"
                    aria-label="Clear search"
                  >
                    <MdiIcon name="close" size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            className="overflow-y-auto py-1"
            style={{ maxHeight: menuPos.maxHeight - (menuTitle ? 36 : 0) - (searchable ? 48 : 0) }}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-text-muted">
                <MdiIcon name="progress_activity" size={18} spin />
                Loading…
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center gap-2 px-3 py-6 text-sm">
                <span className="text-red-500">{loadError}</span>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="text-primary underline underline-offset-2"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-text-muted">{emptyMessage}</p>
            ) : (
              filtered.map((option, index) => {
                const isSelected = valuesEqual(option.value, value);
                const enabledIdx = enabledFiltered.indexOf(option);
                const focused = enabledIdx >= 0 && enabledIdx === focusedIndex;
                return (
                  <OptionRow
                    key={`${String(option.value)}-${option.label}`}
                    option={option}
                    selected={isSelected}
                    showDescription={showDescription}
                    focused={focused}
                    onSelect={selectOption}
                    onHover={() => enabledIdx >= 0 && setFocusedIndex(enabledIdx)}
                    renderOption={renderOption}
                  />
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  const trigger = (
    <button
      ref={triggerRef}
      id={id}
      type="button"
      disabled={disabled || loading}
      onClick={toggleOpen}
      onKeyDown={onTriggerKeyDown}
      aria-label={ariaLabel || (showInlineLabel ? undefined : displayLabel || label)}
      aria-haspopup="listbox"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      className={cn(
        TRIGGER_CLASSES,
        triggerSizeClass,
        widthClass,
        fullWidth && "justify-between",
        error && "ring-1 ring-red-500/50",
        triggerClassName,
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {loading ? (
          <MdiIcon name="progress_activity" size={16} spin className="text-text-muted" />
        ) : icon ? (
          <MdiIcon name={icon} size={size === "sm" ? 16 : 18} className="shrink-0 text-text-muted" />
        ) : null}
        {showInlineLabel ? (
          <span className={cn("text-text-muted shrink-0", hideLabelOnMobile && "hidden sm:inline")}>
            {displayLabel}
          </span>
        ) : null}
        <span className={cn("min-w-0 truncate font-medium text-text-main", !renderTriggerValue && "capitalize")}>
          {renderTriggerValue && selected ? renderTriggerValue(selected) : triggerValue}
        </span>
      </span>
      <MdiIcon
        name="expand_more"
        size={size === "sm" ? 16 : 18}
        className={cn(
          "shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none",
          open && "rotate-180",
        )}
      />
    </button>
  );

  if (!label && !hint && !error) {
    return (
      <div className={cn("relative", widthClass, className)}>
        {trigger}
        {menu}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", widthClass, className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-text-main">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      ) : null}
      <div className="relative">{trigger}{menu}</div>
      {error ? (
        <p className="flex items-center gap-1 text-xs text-red-500">
          <MdiIcon name="error" size={14} />
          {error}
        </p>
      ) : null}
      {hint && !error ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

Select.propTypes = {
  label: PropTypes.string,
  triggerLabel: PropTypes.string,
  menuTitle: PropTypes.string,
  icon: PropTypes.string,
  options: PropTypes.array,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.bool]),
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
  error: PropTypes.string,
  hint: PropTypes.string,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
  loading: PropTypes.bool,
  loadError: PropTypes.string,
  onRetry: PropTypes.func,
  emptyMessage: PropTypes.string,
  variant: PropTypes.oneOf(["compact", "descriptive", "searchable"]),
  searchable: PropTypes.bool,
  fullWidth: PropTypes.bool,
  size: PropTypes.oneOf(["sm", "md"]),
  hideLabelOnMobile: PropTypes.bool,
  hideTriggerLabel: PropTypes.bool,
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
  id: PropTypes.string,
  "aria-label": PropTypes.string,
  renderOption: PropTypes.func,
  renderTriggerValue: PropTypes.func,
};
