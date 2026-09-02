"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { DashboardStatsSkeleton } from "@/shared/components";
import Card from "@/shared/components/Card";
import Select from "@/shared/components/Select";
import { cn } from "@/shared/utils/cn";
import { isAbortError } from "@/shared/hooks/useNavigationAbort";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { buildHeatmapGrid } from "@/shared/utils/usageHeatmap";
import ModelsAnalyticsTab from "./ModelsAnalyticsTab";

const HEATMAP_COLORS = [
  "bg-black/[0.06] dark:bg-white/[0.06]",
  "bg-sky-400/35 dark:bg-sky-400/30",
  "bg-sky-500/55 dark:bg-sky-500/50",
  "bg-sky-500/75 dark:bg-sky-500/70",
  "bg-sky-600 dark:bg-sky-500",
];

function fmtNum(n) {
  return new Intl.NumberFormat().format(n || 0);
}

function fmtTokens(n) {
  const v = n || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}K`;
  if (v >= 1_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return fmtNum(v);
}

function fmtHeatmapDate(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtHeatmapTooltip(dateKey, count, tokens) {
  const date = fmtHeatmapDate(dateKey);
  if (!count) return `${date} — No activity`;
  if (tokens > 0) return `${date} — ${fmtNum(count)} · ${fmtTokens(tokens)} tok`;
  return `${date} — ${fmtNum(count)}`;
}

function resolveHeatmap(apiHeatmap) {
  if (apiHeatmap?.rows?.length !== 7) return buildHeatmapGrid();

  const hasGaps = apiHeatmap.rows.some((row) => row.some((c) => c == null));
  if (!hasGaps) return apiHeatmap;

  const dayMap = {};
  for (const row of apiHeatmap.rows) {
    for (const cell of row) {
      if (cell?.date) {
        dayMap[cell.date] = { requests: cell.count ?? 0, tokens: cell.tokens ?? 0 };
      }
    }
  }
  return buildHeatmapGrid(dayMap);
}

function HeatmapCell({ cell, onHover, onLeave }) {
  const cellClass = "h-3 min-w-0 flex-1 rounded-[3px] sm:h-3.5";

  if (!cell || cell.filler) {
    return (
      <div
        className={cn(cellClass, HEATMAP_COLORS[0])}
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      aria-label={fmtHeatmapTooltip(cell.date, cell.count, cell.tokens)}
      className={cn(
        cellClass,
        "p-0 transition-all",
        "hover:ring-2 hover:ring-sky-400/70 hover:ring-offset-1 hover:ring-offset-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70",
        HEATMAP_COLORS[cell.level ?? 0] || HEATMAP_COLORS[0],
      )}
    />
  );
}

HeatmapCell.propTypes = {
  cell: PropTypes.shape({
    date: PropTypes.string,
    count: PropTypes.number,
    tokens: PropTypes.number,
    level: PropTypes.number,
    filler: PropTypes.bool,
  }),
  onHover: PropTypes.func.isRequired,
  onLeave: PropTypes.func.isRequired,
};

function HeatmapGrid({ heatmap }) {
  const rows = heatmap?.rows || buildHeatmapGrid().rows;
  const [tip, setTip] = useState(null);

  const showTip = (e, cell) => {
    if (!cell) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      date: cell.date,
      count: cell.count ?? 0,
      tokens: cell.tokens ?? 0,
    });
  };

  return (
    <>
      <div className="w-full pb-1">
        <div className="flex w-full flex-col gap-1">
          {rows.map((row, ri) => (
            <div key={ri} className="flex w-full gap-1">
              {row.map((cell, ci) => (
                <HeatmapCell
                  key={`${ri}-${ci}`}
                  cell={cell}
                  onHover={(e) => showTip(e, cell)}
                  onLeave={() => setTip(null)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-text-muted">
          <div className="flex gap-2">
            {heatmap?.rangeStart && (
              <span>{fmtHeatmapDate(heatmap.rangeStart)}</span>
            )}
            {heatmap?.rangeEnd && (
              <>
                <span aria-hidden>→</span>
                <span>{fmtHeatmapDate(heatmap.rangeEnd)}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span>Less</span>
            {HEATMAP_COLORS.map((color, i) => (
              <span key={i} className={cn("size-2.5 rounded-[2px]", color)} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/10 bg-[#171717] px-3 py-1.5 text-xs font-medium text-white shadow-xl"
          style={{ left: tip.x, top: tip.y - 8 }}
        >
          {fmtHeatmapTooltip(tip.date, tip.count, tip.tokens)}
        </div>
      )}
    </>
  );
}

HeatmapGrid.propTypes = {
  heatmap: PropTypes.shape({
    rows: PropTypes.array,
    rangeStart: PropTypes.string,
    rangeEnd: PropTypes.string,
  }).isRequired,
};

function fmtCost(n) {
  const v = n || 0;
  if (v >= 1) return `~$${v.toFixed(2)}`;
  if (v >= 0.01) return `~$${v.toFixed(2)}`;
  if (v > 0) return `~$${v.toFixed(4)}`;
  return "~$0.00";
}

function shortenModel(name) {
  if (!name) return "—";
  const parts = name.split("/");
  const last = parts[parts.length - 1];
  if (last.length <= 24) return last;
  return `${last.slice(0, 21)}…`;
}

function fmtProvider(id) {
  if (!id) return "—";
  return AI_PROVIDERS[id]?.name || id;
}

function StatBox({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-border/60 bg-black/[0.02] px-4 py-3 dark:bg-white/[0.03]">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] text-text-muted">{hint}</div> : null}
    </div>
  );
}

StatBox.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  hint: PropTypes.string,
};

function OverviewSkeleton() {
  return (
    <Card className="overflow-hidden" padding="md">
      <DashboardStatsSkeleton />
    </Card>
  );
}

export default function UsageOverviewCard({ signal, apiKeys = [] }) {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiKeyId, setApiKeyId] = useState("all");

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      setLoading(true);
      const params = new URLSearchParams({ period: "60d" });
      if (apiKeyId && apiKeyId !== "all") params.set("apiKeyId", apiKeyId);
      fetch(`/api/usage/overview?${params}`, { signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (!cancelled && json) setData(json);
        })
        .catch((err) => {
          if (!isAbortError(err) && !cancelled) setData(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load();

    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signal, apiKeyId]);

  if (loading && !data) return <OverviewSkeleton />;

  const heatmap = resolveHeatmap(data?.heatmap);

  return (
    <Card className="overflow-hidden" padding="md">
      <div className="flex flex-col gap-4">
        {/* Header: tabs + API key filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-1 rounded-lg bg-black/[0.04] p-1 dark:bg-white/[0.04]">
            {[
              { value: "overview", label: "Overview" },
              { value: "models", label: "Models" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTab(opt.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === opt.value
                    ? "bg-surface text-text-main shadow-sm"
                    : "text-text-muted hover:text-text-main",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {apiKeys.length > 0 && (
            <div className="relative w-full sm:w-auto sm:min-w-[200px]">
              <Select
                size="sm"
                fullWidth
                value={apiKeyId}
                onChange={(e) => setApiKeyId(e.target.value)}
                options={[
                  { value: "all", label: "All API keys" },
                  ...apiKeys.map((key) => ({ value: key.id, label: key.name })),
                ]}
                aria-label="Filter by API key"
                triggerClassName="sm:min-w-[200px]"
              />
            </div>
          )}
        </div>

        {loading && data && (
          <p className="text-xs text-text-muted">Updating…</p>
        )}

        {tab === "overview" ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBox label="Active providers" value={fmtNum(data?.activeProviders)} />
              <StatBox label="Messages/Turn" value={fmtNum(data?.messages)} />
              <StatBox
                label="Total tokens"
                value={fmtTokens(data?.totalTokens)}
                hint={`${fmtTokens(data?.totalPromptTokens)} in + ${fmtTokens(data?.totalCompletionTokens)} out`}
              />
              <StatBox label="Cache tokens" value={fmtTokens(data?.totalCachedTokens)} hint="subset of input" />
              <StatBox label="Est. Cost" value={fmtCost(data?.totalCost)} />
              <StatBox label="Active days" value={fmtNum(data?.activeDays)} />
              <StatBox label="Favorite providers" value={fmtProvider(data?.favoriteProvider)} />
              <StatBox label="Favorite model" value={shortenModel(data?.favoriteModel)} />
            </div>

            <HeatmapGrid heatmap={heatmap} />

            {data?.comparison && (
              <p className="text-sm text-text-muted">{data.comparison}</p>
            )}
          </>
        ) : (
          <ModelsAnalyticsTab analytics={data?.modelsAnalytics} />
        )}
      </div>
    </Card>
  );
}

UsageOverviewCard.propTypes = {
  signal: PropTypes.object,
  apiKeys: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    }),
  ),
};
