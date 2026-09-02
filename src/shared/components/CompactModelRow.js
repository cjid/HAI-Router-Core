"use client";

import PropTypes from "prop-types";
import ProviderIcon from "./ProviderIcon";
import Tooltip from "./Tooltip";
import MdiIcon from "@/shared/components/MdiIcon";
import {
  CompactCapabilitiesInline,
  ReasoningCell,
} from "@/app/(dashboard)/dashboard/providers/components/CapabilityModalityIcons";
import { resolveModelPickerMeta } from "@/shared/utils/resolveModelPickerMeta";
import { cn } from "@/shared/utils/cn";

const ROW_BASE =
  "flex min-h-9 max-h-11 items-center gap-1.5 min-w-0 rounded-md px-1.5 py-0.5 transition-colors";

function ModelIdentity({ displayName, modelId, onEditStart }) {
  return (
    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2 leading-tight">
      <span className="text-xs font-medium text-text-main truncate min-w-0 sm:max-w-[45%]">{displayName}</span>
      <Tooltip text={modelId} position="bottom">
        <code
          role={onEditStart ? "button" : undefined}
          tabIndex={onEditStart ? 0 : undefined}
          onClick={onEditStart ? (e) => { e.stopPropagation(); onEditStart(); } : undefined}
          onKeyDown={onEditStart ? (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onEditStart();
            }
          } : undefined}
          className={cn(
            "font-mono text-[10px] text-text-muted truncate min-w-0 flex-1 no-underline",
            onEditStart && "cursor-pointer hover:text-primary",
          )}
        >
          {modelId}
        </code>
      </Tooltip>
    </div>
  );
}

ModelIdentity.propTypes = {
  displayName: PropTypes.string.isRequired,
  modelId: PropTypes.string.isRequired,
  onEditStart: PropTypes.func,
};

/**
 * Compact single-line model row — shared across picker, editor, and preview.
 * @param {"picker"|"editor"|"preview"} variant
 */
export default function CompactModelRow({
  variant = "picker",
  modelValue,
  modelAliases = {},
  meta: metaProp,
  displayName: displayNameProp,
  providerId: providerIdProp,
  group,
  order,
  selected = false,
  disabled = false,
  onClick,
  editing = false,
  draft = "",
  onDraftChange,
  onCommitEdit,
  onCancelEdit,
  onEditStart,
  dragHandle,
  onMoveUp,
  onMoveDown,
  onRemove,
  isFirst = false,
  isLast = false,
  showProvider = true,
  trailing,
  className,
}) {
  const meta = metaProp || resolveModelPickerMeta(modelValue, { modelAliases });
  if (!meta) return null;

  const displayName = displayNameProp || meta.displayName || modelValue;
  const modelId = modelValue || meta.modelValue;
  const providerId = providerIdProp || meta.providerId || group?.providerId;

  const isPicker = variant === "picker";
  const isEditor = variant === "editor";
  const isPreview = variant === "preview";

  const rowClass = cn(
    ROW_BASE,
    isPicker && "w-full text-left border",
    isPicker && selected && "border-primary/40 bg-primary/6",
    isPicker && !selected && "border-transparent hover:bg-primary/5",
    isEditor && "bg-black/[0.02] hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]",
    isPreview && "min-h-7 max-h-9 py-0",
    disabled && "opacity-60 pointer-events-none",
    className,
  );

  const inner = (
    <>
      {order != null && (
        <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-text-muted tabular-nums">
          {order}
        </span>
      )}

      {dragHandle}

      {showProvider && !isPicker && providerId && !meta.isCombo && (
        <ProviderIcon
          providerId={providerId}
          completionBaseUrl={group?.baseUrl}
          compatibility={group?.compatibility}
          apiType={group?.apiType}
          src={group?.baseUrl ? null : `/providers/${providerId}.png`}
          alt={meta.providerName || group?.name}
          size={20}
          className="shrink-0"
          fallbackText={(meta.providerName || group?.name || providerId).slice(0, 2).toUpperCase()}
          fallbackColor={group?.color}
        />
      )}

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange?.(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitEdit?.();
            if (e.key === "Escape") {
              onDraftChange?.(modelId);
              onCancelEdit?.();
            }
          }}
          className="min-w-0 flex-1 rounded border border-primary/40 bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text-main outline-none h-7"
        />
      ) : (
        <ModelIdentity
          displayName={displayName}
          modelId={modelId}
          onEditStart={isEditor && !editing ? onEditStart : undefined}
        />
      )}

      {!editing && !meta.isCombo && (
        <>
          <CompactCapabilitiesInline
            inputModalities={meta.inputModalities}
            outputModalities={meta.outputModalities}
          />
          <ReasoningCell value={meta.reasoning} compact />
        </>
      )}

      {trailing}

      {isPicker && selected && (
        <MdiIcon name="check" size={16} className="text-primary shrink-0" aria-hidden />
      )}

      {isEditor && !editing && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className={cn(
              "p-0.5 rounded",
              isFirst ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary",
            )}
            title="Move up"
          >
            <MdiIcon name="arrow_upward" size={14} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className={cn(
              "p-0.5 rounded",
              isLast ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary",
            )}
            title="Move down"
          >
            <MdiIcon name="arrow_downward" size={14} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-0.5 rounded text-text-muted hover:text-red-500"
            title="Remove"
          >
            <MdiIcon name="close" size={14} />
          </button>
        </div>
      )}
    </>
  );

  if (isPicker) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={rowClass}
        aria-pressed={selected}
      >
        {inner}
      </button>
    );
  }

  return <div className={rowClass}>{inner}</div>;
}

CompactModelRow.propTypes = {
  variant: PropTypes.oneOf(["picker", "editor", "preview"]),
  modelValue: PropTypes.string.isRequired,
  modelAliases: PropTypes.object,
  meta: PropTypes.object,
  displayName: PropTypes.string,
  providerId: PropTypes.string,
  group: PropTypes.object,
  order: PropTypes.number,
  selected: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  editing: PropTypes.bool,
  draft: PropTypes.string,
  onDraftChange: PropTypes.func,
  onCommitEdit: PropTypes.func,
  onCancelEdit: PropTypes.func,
  onEditStart: PropTypes.func,
  dragHandle: PropTypes.node,
  onMoveUp: PropTypes.func,
  onMoveDown: PropTypes.func,
  onRemove: PropTypes.func,
  isFirst: PropTypes.bool,
  isLast: PropTypes.bool,
  showProvider: PropTypes.bool,
  trailing: PropTypes.node,
  className: PropTypes.string,
};
