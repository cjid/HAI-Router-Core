"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import { useMemo } from "react";
import PropTypes from "prop-types";
import {
  flexRender,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import Tooltip from "@/shared/components/Tooltip";
import { cn } from "@/shared/utils/cn";
import { CapabilitiesCell, ReasoningCell } from "./CapabilityModalityIcons";
import {
  PricingCell,
  RepoRowActions,
  RowActions,
  StateBadge,
  getModelTestRowClass,
} from "./ModelCatalogCells";
import { useVirtualTableRows, VIRTUAL_ROW_HEIGHT } from "./useVirtualTableRows";

const TABLE_FEATURES = tableFeatures({});

const COL = {
  model: { width: 260, th: "px-3 text-left", td: "px-3 text-left" },
  capabilities: { width: 152, th: "px-2 text-left", td: "px-2 text-left" },
  reasoning: { width: 92, th: "px-1.5 text-center", td: "px-1.5 text-center" },
  context: { width: 72, th: "px-2 text-center whitespace-nowrap", td: "px-2 text-center" },
  pricing: { width: 108, th: "px-2 text-center whitespace-nowrap", td: "px-2 text-center" },
  state: { width: 80, th: "px-2 text-center", td: "px-2 text-center whitespace-nowrap overflow-hidden" },
  actions: { width: 140, th: "px-2 text-center pr-3", td: "px-2 text-center pr-3 whitespace-nowrap" },
};

const TABLE_MIN_WIDTH = Object.values(COL).reduce((sum, c) => sum + c.width, 0);

const TH_BASE =
  "py-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted/75 align-middle";

const TD_BASE = "py-2.5 align-middle";

function ModelCellContent({ displayName, modelId, displayModel }) {
  return (
    <div className="flex min-w-0 max-w-[236px] items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <MdiIcon name="smart_toy" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-[1.25]">{displayName || modelId}</p>
        <code
          className="mt-1 block truncate font-mono text-[10px] leading-[1.2] text-text-muted"
          title={displayModel}
        >
          {displayModel}
        </code>
      </div>
    </div>
  );
}

ModelCellContent.propTypes = {
  displayName: PropTypes.string,
  modelId: PropTypes.string.isRequired,
  displayModel: PropTypes.string.isRequired,
};

function resolveDisplayModel(row, resolveThinkingSuffix) {
  const thinkingSuffix = resolveThinkingSuffix?.(row.modelId) || null;
  return thinkingSuffix ? `${row.fullModel}(${thinkingSuffix})` : row.fullModel;
}

export default function ModelCatalogTable({
  rows,
  variant = "configured",
  disabledSet,
  copied,
  onCopy,
  onDisable,
  onDeleteCustom,
  onTest,
  onEnable,
  onAdd,
  modelTestResults = {},
  testingModelIds = new Set(),
  showTest = false,
  resolveThinkingSuffix,
  emptyMessage = "No models",
  scrollContainerRef = null,
}) {
  const emptyDisabledSet = useMemo(() => new Set(), []);
  const stateDisabledSet = disabledSet || emptyDisabledSet;
  const { virtualize, visibleRows, topSpacer, bottomSpacer } = useVirtualTableRows(rows, scrollContainerRef);

  const columns = useMemo(() => {
    const actionCell = ({ row }) => {
      const data = row.original;
      const displayModel = resolveDisplayModel(data, resolveThinkingSuffix);

      if (variant === "repo") {
        return (
          <RepoRowActions
            row={data}
            displayModel={displayModel}
            copied={copied}
            onCopy={onCopy}
            onAdd={onAdd}
          />
        );
      }
      const isDisabled = stateDisabledSet.has(data.modelId);
      return (
        <RowActions
          row={data}
          displayModel={displayModel}
          copied={copied}
          onCopy={onCopy}
          onDisable={onDisable}
          onEnable={onEnable}
          onDeleteCustom={onDeleteCustom}
          onTest={onTest}
          testStatus={modelTestResults[data.modelId]}
          isTesting={testingModelIds.has(data.modelId)}
          showTest={showTest}
          isDisabled={isDisabled}
        />
      );
    };

    return [
      {
        id: "model",
        header: "Model",
        cell: ({ row }) => {
          const data = row.original;
          return (
            <ModelCellContent
              displayName={data.displayName}
              modelId={data.modelId}
              displayModel={resolveDisplayModel(data, resolveThinkingSuffix)}
            />
          );
        },
      },
      {
        id: "capabilities",
        header: "Capabilities",
        cell: ({ row }) => (
          <CapabilitiesCell
            inputModalities={row.original.inputModalities}
            outputModalities={row.original.outputModalities}
          />
        ),
      },
      {
        id: "reasoning",
        header: "Reasoning",
        cell: ({ row }) => <ReasoningCell value={row.original.reasoning} />,
      },
      {
        id: "context",
        header: "Context",
        cell: ({ row }) => {
          const data = row.original;
          if (data.contextTokens) {
            return (
              <Tooltip text={`${data.contextTokens.toLocaleString()} tokens max`} position="bottom">
                <span className="font-mono text-[11px] font-medium tabular-nums">{data.contextLabel}</span>
              </Tooltip>
            );
          }
          return (
            <span className="font-mono text-[11px] font-medium tabular-nums text-text-muted">
              {data.contextLabel}
            </span>
          );
        },
      },
      {
        id: "pricing",
        header: "Pricing",
        cell: ({ row }) => <PricingCell row={row.original} />,
      },
      {
        id: "state",
        header: "State",
        cell: ({ row }) => <StateBadge row={row.original} disabledSet={stateDisabledSet} />,
      },
      {
        id: "actions",
        header: "Actions",
        cell: actionCell,
      },
    ];
  }, [
    copied,
    modelTestResults,
    onAdd,
    onCopy,
    onDeleteCustom,
    onDisable,
    onEnable,
    onTest,
    resolveThinkingSuffix,
    showTest,
    stateDisabledSet,
    testingModelIds,
    variant,
  ]);

  const table = useTable({
    features: TABLE_FEATURES,
    data: visibleRows,
    columns,
    getRowId: (row) => `${variant}-${row.modelId}`,
  });

  if (!rows.length) {
    return (
      <div className="px-4 py-8 text-center text-sm text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <table
      className="w-full border-separate border-spacing-0 text-sm"
      style={{ minWidth: TABLE_MIN_WIDTH, tableLayout: "fixed" }}
    >
      <colgroup>
        {table.getAllLeafColumns().map((col) => (
          <col key={col.id} style={{ width: COL[col.id]?.width }} />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-10 bg-surface">
        <tr className="border-b border-black/5 dark:border-white/5">
          {table.getLeafHeaders().map((header) => {
            const id = header.column.id;
            const layout = COL[id];
            return (
              <th
                key={header.id}
                scope="col"
                className={cn(TH_BASE, layout?.th, "bg-surface")}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {virtualize && topSpacer > 0 ? (
          <tr aria-hidden="true" className="border-0">
            <td colSpan={table.getAllLeafColumns().length} className="border-0 p-0" style={{ height: topSpacer }} />
          </tr>
        ) : null}
        {table.getRowModel().rows.map((row) => {
          const data = row.original;
          const isTesting = testingModelIds.has(data.modelId);
          const testStatus = modelTestResults[data.modelId];
          const cells = row.getAllCells();

          return (
          <tr
            key={row.id}
            className={cn(
              "group border-b border-black/5 transition-[box-shadow,color] duration-300 last:border-b-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.02]",
              getModelTestRowClass({ isTesting, testStatus }),
            )}
            style={virtualize ? { height: VIRTUAL_ROW_HEIGHT } : undefined}
          >
            {cells.map((cell) => {
              const id = cell.column.id;
              const layout = COL[id];
              return (
                <td
                  key={cell.id}
                  className={cn(TD_BASE, layout?.td)}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              );
            })}
          </tr>
          );
        })}
        {virtualize && bottomSpacer > 0 ? (
          <tr aria-hidden="true" className="border-0">
            <td colSpan={table.getAllLeafColumns().length} className="border-0 p-0" style={{ height: bottomSpacer }} />
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

ModelCatalogTable.propTypes = {
  rows: PropTypes.array.isRequired,
  variant: PropTypes.oneOf(["configured", "repo"]),
  disabledSet: PropTypes.instanceOf(Set),
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDisable: PropTypes.func,
  onDeleteCustom: PropTypes.func,
  onTest: PropTypes.func,
  onEnable: PropTypes.func,
  onAdd: PropTypes.func,
  modelTestResults: PropTypes.object,
  testingModelIds: PropTypes.instanceOf(Set),
  showTest: PropTypes.bool,
  resolveThinkingSuffix: PropTypes.func,
  emptyMessage: PropTypes.string,
  scrollContainerRef: PropTypes.object,
};
