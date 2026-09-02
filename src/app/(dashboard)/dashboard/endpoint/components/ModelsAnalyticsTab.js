"use client";

import PropTypes from "prop-types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/shared/utils/cn";

const MODEL_COLORS = [
  "#1d4ed8",
  "#2563eb",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#bfdbfe",
  "#dbeafe",
];

/** ~6 model rows visible; scroll when list grows */
const BREAKDOWN_MAX_HEIGHT = "max-h-52";

function fmtNum(n) {
  return new Intl.NumberFormat().format(n || 0);
}

function fmtCompact(n) {
  const v = n || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return fmtNum(v);
}

function fmtPct(n) {
  return `${(n || 0).toFixed(1)}%`;
}

function StatBox({ label, value }) {
  return (
    <div className="rounded-xl border border-border/60 bg-black/[0.02] px-4 py-3 dark:bg-white/[0.03]">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

StatBox.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-[#171717] px-3 py-2 text-xs text-white shadow-xl">
      <div className="mb-1 font-medium">{label}</div>
      {payload.filter((p) => p.value > 0).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 tabular-nums">
          <span className="size-2 rounded-sm" style={{ backgroundColor: p.color }} />
          <span className="truncate max-w-[140px]">{p.dataKey}</span>
          <span className="ml-auto">{fmtCompact(p.value)} out</span>
        </div>
      ))}
    </div>
  );
}

ChartTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  label: PropTypes.string,
};

export default function ModelsAnalyticsTab({ analytics }) {
  const chartSeries = analytics?.chartSeries || [];
  const stackKeys = analytics?.stackKeys || [];
  const breakdown = analytics?.breakdown || [];
  const summary = analytics?.summary || {};

  const hasChartData = chartSeries.some((row) =>
    stackKeys.some((key) => (row[key] || 0) > 0),
  );

  const hasBreakdown = breakdown.length > 0;

  if (!hasChartData && !hasBreakdown) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-text-muted">
        No model usage for this period
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Models used" value={fmtNum(summary.modelCount)} />
        <StatBox label="Total output" value={fmtCompact(summary.totalOutput)} />
        <StatBox label="Total input" value={fmtCompact(summary.totalInput)} />
        <StatBox
          label="Top model share"
          value={summary.topModel ? fmtPct(summary.topModelShare) : "—"}
        />
      </div>

      <div className="w-full min-h-[220px]">
        {!hasChartData ? (
          <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-text-muted">
            Not enough daily output data for chart
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.08} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.45 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.45 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtCompact}
                width={44}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              {stackKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="output"
                  fill={MODEL_COLORS[i % MODEL_COLORS.length]}
                  radius={i === stackKeys.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={24}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {breakdown.length > 0 && (
        <div
          className={cn(
            "flex flex-col gap-1 overflow-y-auto overscroll-contain pr-1",
            BREAKDOWN_MAX_HEIGHT,
          )}
        >
          {breakdown.map((m, i) => (
            <div
              key={`${m.model}-${m.provider}-${i}`}
              className="flex shrink-0 items-center gap-3 rounded-lg px-1 py-1.5 text-sm"
            >
              <span
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{m.model}</span>
              <span className="hidden shrink-0 text-xs text-text-muted sm:inline">
                {fmtCompact(m.promptTokens)} in · {fmtCompact(m.completionTokens)} out
              </span>
              <span className="shrink-0 tabular-nums text-text-muted">{fmtPct(m.percentage)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

ModelsAnalyticsTab.propTypes = {
  analytics: PropTypes.shape({
    chartSeries: PropTypes.array,
    stackKeys: PropTypes.arrayOf(PropTypes.string),
    breakdown: PropTypes.array,
    summary: PropTypes.object,
  }),
};
