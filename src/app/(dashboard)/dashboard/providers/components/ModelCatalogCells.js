"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import PropTypes from "prop-types";
import {
  mdiBlockHelper,
  mdiCheck,
  mdiClose,
  mdiContentCopy,
  mdiFlaskOutline,
  mdiLoading,
  mdiPlus,
} from "@mdi/js";
import Tooltip from "@/shared/components/Tooltip";
import { cn } from "@/shared/utils/cn";
import { formatModelPricing, resolvePricingTier } from "@/shared/utils/modelCatalog";
import { getSemanticTextClass } from "@/shared/utils/statusSemantic";
import { TableMdi } from "./CapabilityModalityIcons";
import {
  getModelTestButtonClass,
  getModelTestTooltip,
  MODEL_ROW_ACTION_BTN,
} from "./modelTestVisual";

export { getModelTestRowClass, getModelTestCellClass } from "./modelTestVisual";

export function StateBadge({ row, disabledSet }) {
  if (row.catalogSection === "repo-suggested") {
    return (
      <span className={cn("inline-flex max-w-full items-center gap-1 text-[11px] font-medium truncate", getSemanticTextClass("info"))}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        Suggested
      </span>
    );
  }
  if (row.catalogSection === "repo-fetched") {
    if (row.stale || row.syncStatus === "unavailable") {
      return (
        <span className={cn("inline-flex max-w-full items-center gap-1 text-[11px] font-medium truncate", getSemanticTextClass("warning"))}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          Unavail.
        </span>
      );
    }
    return (
      <span className={cn("inline-flex max-w-full items-center gap-1 text-[11px] font-medium truncate", getSemanticTextClass("success"))}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        Fetched
      </span>
    );
  }
  if (row.catalogSection === "suggested") {
    return (
      <span className={cn("inline-flex max-w-full items-center gap-1 text-[11px] font-medium truncate", getSemanticTextClass("info"))}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        Suggested
      </span>
    );
  }
  if (row.catalogSection === "disabled" || disabledSet.has(row.modelId)) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted/50" aria-hidden />
        Disabled
      </span>
    );
  }
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 text-[11px] font-medium truncate", getSemanticTextClass("success"))}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      Active
    </span>
  );
}

StateBadge.propTypes = {
  row: PropTypes.object.isRequired,
  disabledSet: PropTypes.instanceOf(Set).isRequired,
};

export function PricingCell({ row }) {
  const pricing = row.pricingDisplay || formatModelPricing({
    inputPrice: row.inputPrice,
    outputPrice: row.outputPrice,
    pricingStatus: row.pricingStatus,
    isFree: row.isFree,
  });
  const tier = row.pricingTier || resolvePricingTier({
    inputPrice: row.inputPrice,
    outputPrice: row.outputPrice,
    pricingStatus: row.pricingStatus || pricing.status,
    isFree: row.isFree,
  });

  if (pricing.status === "free" || tier?.tier === "free") {
    return (
      <span className={tier?.className || cn("inline-flex rounded-md border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium", getSemanticTextClass("success"))}>
        {tier?.label || "Free"}
      </span>
    );
  }
  if (pricing.status === "provider_quota") {
    return <span className="text-[11px] text-text-muted">Included</span>;
  }
  if (pricing.status === "unknown") {
    return <span className="text-[11px] text-text-muted">—</span>;
  }

  return (
    <Tooltip text={`Input ${pricing.inputLabel} · Output ${pricing.outputLabel} per 1M`} position="bottom">
      <span className="inline-flex flex-col items-center gap-0.5">
        {tier ? (
          <span className={tier.className}>{tier.label}</span>
        ) : null}
        <span className="whitespace-nowrap font-mono text-[11px] text-text-muted">
          ↓{pricing.inputLabel} ↑{pricing.outputLabel}
        </span>
      </span>
    </Tooltip>
  );
}

PricingCell.propTypes = {
  row: PropTypes.object.isRequired,
};

const ACTION_BTN = MODEL_ROW_ACTION_BTN;

export function ModelTestAlert({ alert, onDismiss }) {
  if (!alert) return null;
  const isError = alert.type === "error";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
        isError ? "border-red-500/25 bg-red-500/10" : "border-emerald-500/25 bg-emerald-500/10",
      )}
      role="alert"
    >
      <MdiIcon
        name={isError ? "error" : "check_circle"}
        size={18}
        className={cn("mt-0.5 shrink-0", isError ? "text-red-500" : "text-emerald-500")}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", isError ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
          {isError ? "Model test failed" : "Model test succeeded"}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-text-muted">{alert.modelLabel}</p>
        {alert.message ? (
          <p className={cn("mt-1 text-xs break-words", isError ? "text-red-600/90 dark:text-red-400/90" : "text-emerald-700 dark:text-emerald-300/90")}>
            {alert.message}
          </p>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-main"
          aria-label="Dismiss test result"
        >
          <MdiIcon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}

ModelTestAlert.propTypes = {
  alert: PropTypes.shape({
    type: PropTypes.oneOf(["success", "error"]).isRequired,
    modelLabel: PropTypes.string.isRequired,
    message: PropTypes.string,
  }),
  onDismiss: PropTypes.func,
};

export function RowActions({
  row,
  displayModel,
  copied,
  onCopy,
  onDisable,
  onEnable,
  onDeleteCustom,
  onTest,
  testStatus,
  isTesting,
  showTest,
  isDisabled = false,
}) {
  const copyKey = `model-${row.modelId}`;
  const copiedThis = copied === copyKey;

  let testIcon = mdiFlaskOutline;
  let testSpin = false;
  let testTooltip = getModelTestTooltip({ isTesting, testStatus });
  const isTestLocked = isTesting || testStatus === "ok" || testStatus === "error";

  if (isTesting) {
    testIcon = mdiLoading;
    testSpin = true;
  } else if (testStatus === "ok") {
    testIcon = mdiCheck;
  } else if (testStatus === "error") {
    testIcon = mdiClose;
  }

  return (
    <div className="flex shrink-0 items-center justify-center gap-1">
      <Tooltip text="Copy model ID" position="bottom">
        <button
          type="button"
          onClick={() => onCopy(displayModel, copyKey)}
          className={ACTION_BTN}
          aria-label="Copy model ID"
        >
          <TableMdi path={copiedThis ? mdiCheck : mdiContentCopy} className={copiedThis ? "text-emerald-500" : undefined} />
        </button>
      </Tooltip>
      {showTest && onTest && !isDisabled ? (
        <Tooltip text={testTooltip} position="bottom">
          <button
            type="button"
            disabled={isTestLocked}
            onClick={() => onTest(row.modelId)}
            className={getModelTestButtonClass({ isTesting, testStatus })}
            aria-label="Test model"
            aria-busy={isTesting}
          >
            <TableMdi path={testIcon} spin={testSpin} className={testSpin ? "animate-process-spin" : undefined} />
          </button>
        </Tooltip>
      ) : null}
      {row.isCustom && onDeleteCustom ? (
        <Tooltip text="Remove custom model" position="bottom">
          <button
            type="button"
            onClick={() => onDeleteCustom(row.modelId)}
            className={cn(ACTION_BTN, "hover:bg-red-500/10 hover:text-red-500")}
            aria-label="Remove custom model"
          >
            <TableMdi path={mdiClose} />
          </button>
        </Tooltip>
      ) : null}
      {isDisabled && onEnable ? (
        <Tooltip text="Enable model" position="bottom">
          <button
            type="button"
            onClick={() => onEnable(row.modelId)}
            className={cn(ACTION_BTN, "hover:bg-emerald-500/10 hover:text-emerald-500")}
            aria-label="Enable model"
          >
            <TableMdi path={mdiCheck} />
          </button>
        </Tooltip>
      ) : null}
      {!isDisabled && onDisable ? (
        <Tooltip text="Disable model" position="bottom">
          <button
            type="button"
            onClick={() => onDisable(row.modelId)}
            className={cn(ACTION_BTN, "hover:bg-red-500/10 hover:text-red-500")}
            aria-label="Disable model"
          >
            <TableMdi path={mdiBlockHelper} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}

RowActions.propTypes = {
  row: PropTypes.object.isRequired,
  displayModel: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDisable: PropTypes.func,
  onEnable: PropTypes.func,
  onDeleteCustom: PropTypes.func,
  onTest: PropTypes.func,
  testStatus: PropTypes.string,
  isTesting: PropTypes.bool,
  showTest: PropTypes.bool,
  isDisabled: PropTypes.bool,
};

export function RepoRowActions({ row, displayModel, copied, onCopy, onAdd }) {
  const copyKey = `repo-${row.modelId}`;
  const copiedThis = copied === copyKey;

  return (
    <div className="flex shrink-0 items-center justify-center gap-1">
      <Tooltip text="Copy model ID" position="bottom">
        <button
          type="button"
          onClick={() => onCopy(displayModel, copyKey)}
          className={ACTION_BTN}
          aria-label="Copy model ID"
        >
          <TableMdi path={copiedThis ? mdiCheck : mdiContentCopy} className={copiedThis ? "text-emerald-500" : undefined} />
        </button>
      </Tooltip>
      {onAdd ? (
        <Tooltip text="Add to configuration" position="bottom">
          <button
            type="button"
            onClick={() => onAdd(row.modelId)}
            className={cn(ACTION_BTN, "hover:bg-primary/10 hover:text-primary")}
            aria-label="Add to configuration"
          >
            <TableMdi path={mdiPlus} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}

RepoRowActions.propTypes = {
  row: PropTypes.object.isRequired,
  displayModel: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onAdd: PropTypes.func,
};
