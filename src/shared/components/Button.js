"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";
import {
  isProcessLoading,
  normalizeProcessState,
  resolveProcessIcon,
  resolveProcessLabel,
  resolveProcessMinWidthCh,
  PROCESS_STATE,
} from "@/shared/constants/buttonProcess";
import MdiIcon from "./MdiIcon";

const variants = {
  primary: "bg-brand-500 hover:bg-brand-600 hover:brightness-105 text-white shadow-sm disabled:bg-surface-3 disabled:text-text-muted",
  secondary: "bg-surface-2 hover:bg-surface-3 hover:border-brand-500/35 text-text-main border border-border disabled:opacity-50",
  outline: "border border-border text-text-main hover:bg-surface-2 hover:border-brand-500/40",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text-main",
  danger: "bg-red-500 hover:bg-red-600 hover:brightness-105 text-white shadow-sm disabled:bg-surface-3 disabled:text-text-muted",
  success: "bg-green-600 hover:bg-green-700 hover:brightness-105 text-white shadow-sm disabled:bg-surface-3 disabled:text-text-muted",
};

const sizes = {
  sm: "h-7 px-3 text-xs rounded-[8px]",
  md: "h-9 px-4 text-sm rounded-[10px]",
  lg: "h-11 px-6 text-sm rounded-[10px]",
};

const ICON_SLOT = "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center";

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  processState: processStateProp,
  processLabels,
  fullWidth = false,
  className,
  ...props
}) {
  const processState = normalizeProcessState(processStateProp, { loading, disabled });
  const isLoading = isProcessLoading(processState);
  const isSuccess = processState === PROCESS_STATE.SUCCESS;
  const isError = processState === PROCESS_STATE.ERROR;
  const isBusy = isLoading || disabled;

  const leadingIcon = resolveProcessIcon(processState, icon);
  const useProcessLabel = Boolean(processLabels);
  const label = useProcessLabel
    ? resolveProcessLabel(processState, { processLabels, children })
    : null;
  const minWidthCh = useProcessLabel ? resolveProcessMinWidthCh(processLabels, children) : null;
  const showLeadingIcon = Boolean(leadingIcon);

  return (
    <button
      className={cn(
        "group inline-flex items-center justify-center gap-2 font-semibold",
        "transition-[transform,background-color,border-color,filter] duration-150 ease-out cursor-pointer",
        "active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        isSuccess && variant !== "success" && "ring-1 ring-emerald-500/30",
        isError && variant !== "danger" && "ring-1 ring-red-500/30",
        className,
      )}
      disabled={isBusy}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {showLeadingIcon ? (
        <span className={ICON_SLOT} aria-hidden>
          <MdiIcon
            name={leadingIcon}
            size={18}
            spin={isLoading}
            className={cn(
              "transition-transform duration-150 motion-reduce:transition-none",
              isLoading && "animate-process-spin motion-reduce:animate-none",
              !isBusy && "group-hover:-translate-y-px",
              isSuccess && "text-emerald-500",
              isError && "text-red-500",
            )}
          />
        </span>
      ) : null}
      <span
        className={cn(useProcessLabel && "truncate")}
        style={minWidthCh ? { minWidth: `${minWidthCh}ch` } : undefined}
      >
        {useProcessLabel ? label : children}
      </span>
      {iconRight && !isLoading && !isSuccess && !isError ? (
        <span className={ICON_SLOT} aria-hidden>
          <MdiIcon
            name={iconRight}
            size={18}
            className="transition-transform duration-150 group-hover:-translate-y-px motion-reduce:transition-none"
          />
        </span>
      ) : null}
    </button>
  );
}

Button.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(["primary", "secondary", "outline", "ghost", "danger", "success"]),
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  icon: PropTypes.string,
  iconRight: PropTypes.string,
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  processState: PropTypes.string,
  processLabels: PropTypes.object,
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
};
