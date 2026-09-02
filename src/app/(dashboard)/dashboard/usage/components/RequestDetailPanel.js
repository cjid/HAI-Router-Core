"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import { cn } from "@/shared/utils/cn";
import { getCachedTokens, getCacheCreationTokens, getInputTokens } from "@/shared/utils/requestDetailTokens";
import {
  buildRequestDetailMetrics,
  getRequestStatusLabel,
  getRequestStatusTone,
} from "@/shared/utils/requestDetailMetrics";
import { classifyTurnFromRequestDetail, getLlmTurnBadgeClass, getLlmTurnLabel } from "@/shared/utils/llmTurnType";
import { useDateTimeFormat } from "@/shared/hooks/useDateTimeFormat";

function MetricTile({ label, value, sub, className }) {
  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-bg-subtle/40 px-3 py-2.5 min-w-0",
      className,
    )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted truncate">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-text-main truncate">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-text-muted truncate">{sub}</p> : null}
    </div>
  );
}

function StatusBadge({ detail }) {
  const label = getRequestStatusLabel(detail);
  const tone = getRequestStatusTone(detail);
  const cls = {
    success: "bg-green-500/10 text-green-600 dark:text-green-400",
    warning: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    error: "bg-red-500/10 text-red-600 dark:text-red-400",
    info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    muted: "bg-surface-2 text-text-muted",
  }[tone] || "bg-surface-2 text-text-muted";

  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize", cls)}>
      {label}
    </span>
  );
}

function MetaRow({ label, value, mono = false, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-b-0">
      <span className="shrink-0 text-sm text-text-muted">{label}</span>
      <span className={cn("text-sm text-text-main text-right break-all", mono && "font-mono text-xs")}>
        {children ?? value ?? "—"}
      </span>
    </div>
  );
}

function TimelineBar({ segment, maxPct = 100 }) {
  const widthPct = Math.max(segment.pct > 0 ? 4 : 0, Math.min(maxPct, segment.pct));
  const barTone = {
    muted: "bg-text-muted/30",
    success: "bg-success/70",
    primary: "bg-primary/70",
  }[segment.tone] || "bg-primary/70";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-text-main truncate">{segment.label}</span>
          {segment.badge ? (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-success/15 text-success">
              {segment.badge}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 font-mono text-xs text-text-muted tabular-nums">
          {segment.ms > 0 ? `${Math.round(segment.ms)}ms` : "—"}
        </span>
      </div>
      <div className="h-2 rounded-full bg-bg-subtle overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barTone)} style={{ width: `${widthPct}%` }} />
      </div>
      {segment.subtitle ? (
        <p className="text-[11px] text-text-muted font-mono">{segment.subtitle}</p>
      ) : null}
    </div>
  );
}

function CollapsiblePayload({ title, icon, children, defaultOpen = false }) {
  return (
    <details className="group rounded-xl border border-border/60 overflow-hidden" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 bg-bg-subtle/40 hover:bg-bg-subtle/70 transition-colors [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          {icon ? <MdiIcon name={icon} size={18} className="text-text-muted" /> : null}
          <span className="text-sm font-semibold text-text-main">{title}</span>
        </div>
        <MdiIcon name="chevron_right" size={18} className="text-text-muted transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border/40 p-4">{children}</div>
    </details>
  );
}

function TurnTypeBadge({ turnType }) {
  if (!turnType || turnType === "unknown") return <span className="text-text-muted">—</span>;
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium", getLlmTurnBadgeClass(turnType))}>
      {getLlmTurnLabel(turnType)}
    </span>
  );
}

function PayloadSkeleton({ lines = 4 }) {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-black/5 dark:bg-white/5"
          style={{ width: `${Math.max(35, 100 - i * 12)}%` }}
        />
      ))}
    </div>
  );
}

function FullDetailErrorBanner({ error, onRetry }) {
  const message = error === "timeout"
    ? "Full request payload timed out."
    : "Unable to load full request payload.";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-500/10"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export default function RequestDetailPanel({
  detail,
  providerName,
  isLoadingFullDetail = false,
  fullDetailError = null,
  onRetry = null,
}) {
  const { formatDateTime } = useDateTimeFormat();

  if (!detail) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
        <MdiIcon name="progress_activity" size={20} spin className="animate-spin" />
        Loading request…
      </div>
    );
  }

  const metrics = buildRequestDetailMetrics(detail);
  const turnType = detail.turnType || classifyTurnFromRequestDetail(detail);
  const providerLabel = providerName || detail.provider || "—";
  const payloadsReady = !isLoadingFullDetail;

  return (
    <div className="space-y-6">
      {fullDetailError ? (
        <FullDetailErrorBanner error={fullDetailError} onRetry={onRetry} />
      ) : null}

      {/* Summary tiles — OpenRouter style */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricTile label="Provider latency" value={metrics.fmt.ms(metrics.providerLatencyMs)} />
        <MetricTile label="Throughput" value={metrics.fmt.throughput(metrics.throughput)} />
        <MetricTile
          label="Tokens"
          value={metrics.fmt.tokens(metrics.inputTokens, metrics.outputTokens, metrics.estimated)}
          sub={metrics.cachedTokens > 0 ? `${metrics.cachedTokens.toLocaleString()} cached` : undefined}
        />
        <MetricTile label="Total time" value={metrics.fmt.ms(metrics.totalMs)} />
        <MetricTile label="TTFT" value={metrics.fmt.ms(metrics.ttftMs)} />
        <MetricTile label="Status" value={<StatusBadge detail={detail} />} />
      </div>

      {/* Overview */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Overview</h3>
        <div className="rounded-xl border border-border/60 px-4 py-1">
          <MetaRow label="Model" value={detail.model} mono />
          <MetaRow label="Provider" value={providerLabel} />
          {detail.connectionId ? (
            <MetaRow label="Connection" value={detail.connectionId.slice(0, 12) + "…"} mono />
          ) : null}
          {metrics.usageStatus ? (
            <MetaRow label="Usage confidence" value={metrics.usageStatus} />
          ) : null}
        </div>
      </section>

      {/* Request metadata */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Request</h3>
        <div className="rounded-xl border border-border/60 px-4 py-1">
          <MetaRow label="Request ID" value={detail.id} mono />
          <MetaRow label="Timestamp" value={formatDateTime(detail.timestamp)} />
          <MetaRow label="Finish reason" value={metrics.finishReason || "—"} mono />
          <MetaRow label="Streaming" value={metrics.isStreaming ? "true" : "false"} mono />
          <MetaRow label="Turn"><TurnTypeBadge turnType={turnType} /></MetaRow>
          {metrics.terminationReason ? (
            <MetaRow label="Termination" value={metrics.terminationReason.replace(/_/g, " ")} mono />
          ) : null}
          {metrics.chunksReceived != null ? (
            <MetaRow
              label="Stream received"
              value={`${metrics.chunksReceived} chunks · ${((metrics.bytesReceived || 0) / 1024).toFixed(1)} KB`}
              mono
            />
          ) : null}
        </div>
      </section>

      {/* Provider timeline */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Provider response</h3>
        <div className="rounded-xl border border-border/60 p-4 space-y-4">
          {metrics.timeline.map((seg) => (
            <TimelineBar key={seg.id} segment={seg} />
          ))}
          <div className="flex justify-end pt-1 border-t border-border/40">
            <span className="text-sm font-medium text-text-main">
              Total: <span className="font-mono tabular-nums">{metrics.fmt.ms(metrics.totalMs)}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Token breakdown */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Token usage</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile label="Input" value={getInputTokens(detail.tokens).toLocaleString()} />
          <MetricTile label="Output" value={`${metrics.estimated ? "~" : ""}${(detail.tokens?.completion_tokens ?? 0).toLocaleString()}`} />
          <MetricTile label="Cached" value={getCachedTokens(detail.tokens).toLocaleString() || "—"} />
          <MetricTile label="Cache write" value={getCacheCreationTokens(detail.tokens).toLocaleString() || "—"} />
        </div>
      </section>

      {detail.network ? (
        <section className="rounded-xl border border-border/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <MdiIcon name="lan" size={18} className="text-text-muted" />
            <span className="text-sm font-semibold text-text-main">Network</span>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-text-muted">Engine</dt><dd className="font-medium capitalize">{detail.network.engine || "—"}</dd></div>
            {detail.network.workerId ? (
              <div><dt className="text-text-muted">Worker</dt><dd className="font-medium">{detail.network.workerId}</dd></div>
            ) : null}
            <div><dt className="text-text-muted">Mode</dt><dd className="font-medium capitalize">{detail.network.egressMode || "—"}</dd></div>
            <div><dt className="text-text-muted">Proxy</dt><dd className="font-medium break-all">{detail.network.proxyLabel || "—"}</dd></div>
          </dl>
        </section>
      ) : null}

      {detail.pxpipe ? (
        <section className="rounded-xl border border-border/60 p-4">
          <div className="flex items-center gap-2 mb-2">
            <MdiIcon name="image" size={18} className="text-text-muted" />
            <span className="text-sm font-semibold text-text-main">PXPIPE</span>
            <StatusBadge detail={{ status: detail.pxpipe.applied ? "success" : "partial" }} />
          </div>
          {detail.pxpipe.applied ? (
            <p className="text-sm text-text-muted font-mono">
              {detail.pxpipe.imageCount || 0} images · saved {detail.pxpipe.savedPct || 0}%
            </p>
          ) : (
            <p className="text-sm text-text-muted">{detail.pxpipe.reason || "skipped"}</p>
          )}
        </section>
      ) : null}

      {/* Payloads */}
      <div className="space-y-3">
        <CollapsiblePayload title="Client request" icon="input">
          {payloadsReady ? (
            <pre className="max-h-[280px] overflow-auto rounded-lg bg-black/5 dark:bg-white/5 p-3 font-mono text-xs text-text-main">
              {detail.request?.redacted ? "{ redacted in list view }" : JSON.stringify(detail.request, null, 2)}
            </pre>
          ) : (
            <PayloadSkeleton lines={5} />
          )}
        </CollapsiblePayload>

        {(payloadsReady ? detail.providerRequest && !detail.providerRequest.redacted : true) ? (
          <CollapsiblePayload title="Provider request (translated)" icon="translate">
            {payloadsReady ? (
              <pre className="max-h-[280px] overflow-auto rounded-lg bg-black/5 dark:bg-white/5 p-3 font-mono text-xs text-text-main">
                {JSON.stringify(detail.providerRequest, null, 2)}
              </pre>
            ) : (
              <PayloadSkeleton lines={5} />
            )}
          </CollapsiblePayload>
        ) : null}

        {(payloadsReady
          ? detail.providerResponse && !detail.providerResponse?.redacted
          : true) && (
          <CollapsiblePayload title="Provider response" icon="data_object">
            {payloadsReady ? (
              <pre className="max-h-[280px] overflow-auto rounded-lg bg-black/5 dark:bg-white/5 p-3 font-mono text-xs text-text-main whitespace-pre-wrap">
                {typeof detail.providerResponse === "object"
                  ? JSON.stringify(detail.providerResponse, null, 2)
                  : detail.providerResponse}
              </pre>
            ) : (
              <PayloadSkeleton lines={6} />
            )}
          </CollapsiblePayload>
        )}

        <CollapsiblePayload title="Client response" icon="output" defaultOpen>
          {payloadsReady ? (
            <>
              {detail.response?.thinking ? (
                <div className="mb-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Thinking</p>
                  <pre className="max-h-[160px] overflow-auto rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 font-mono text-xs text-amber-900 dark:text-amber-100 whitespace-pre-wrap">
                    {detail.response.thinking}
                  </pre>
                </div>
              ) : null}
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Content</p>
              <pre className="max-h-[280px] overflow-auto rounded-lg bg-black/5 dark:bg-white/5 p-3 font-mono text-xs text-text-main whitespace-pre-wrap">
                {detail.response?.redacted
                  ? "{ redacted in list view }"
                  : (detail.response?.content || "[No content]")}
              </pre>
            </>
          ) : (
            <PayloadSkeleton lines={6} />
          )}
        </CollapsiblePayload>
      </div>
    </div>
  );
}
