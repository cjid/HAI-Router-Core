"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import { useMemo, useState, useCallback, useEffect, useRef, startTransition, useDeferredValue } from "react";
import PropTypes from "prop-types";
import { Button, ModelCatalogSkeleton } from "@/shared/components";
import Tooltip from "@/shared/components/Tooltip";
import { cn } from "@/shared/utils/cn";
import { getModelKind } from "@/shared/constants/models";
import { buildModelCatalogSections } from "@/shared/utils/buildModelCatalogSections";
import { supportsModelListForConnection } from "@/shared/utils/providerModelListSupport";
import { getSemanticTextClass } from "@/shared/utils/statusSemantic";
import { PROCESS_STATE } from "@/shared/constants/buttonProcess";
import { useDateTimeFormat } from "@/shared/hooks/useDateTimeFormat";
import ThinkingModeSelect from "./ThinkingModeSelect";
import { ModelCatalogTablePanel } from "./ModelTablePanel";
import { ModelTestAlert } from "./ModelCatalogCells";

function CatalogSkeleton() {
  return <ModelCatalogSkeleton />;
}

export default function ModelsTableSection({
  providerId,
  providerStorageAlias,
  providerDisplayAlias,
  models,
  kiloFreeModels = [],
  customModelRows = [],
  disabledModelIds = [],
  connections = [],
  isFreeNoAuth = false,
  copied,
  onCopy,
  modelTestResults = {},
  testingModelIds = new Set(),
  onTest,
  onDisable,
  onDeleteCustom,
  onAddCustom,
  onEnableModel,
  onDisableAll,
  onEnableAll,
  resolveThinkingSuffix,
  suggestedModels = [],
  onAddSuggested,
  thinkingMode = "auto",
  providerThinkingLevels = null,
  onThinkingModeChange,
  modelTestAlert = null,
  onDismissModelTestAlert,
}) {
  const { formatDateTime } = useDateTimeFormat();
  const [search, setSearch] = useState("");
  const [fetchState, setFetchState] = useState("idle");
  const [resetState, setResetState] = useState("idle");
  const [fetchMessage, setFetchMessage] = useState("");
  const [requestId, setRequestId] = useState(null);
  const [catalogMeta, setCatalogMeta] = useState(null);
  const [discoveredRows, setDiscoveredRows] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogRequestRef = useRef(0);

  const deferredDiscoveredRows = useDeferredValue(discoveredRows);
  const deferredSearch = useDeferredValue(search);

  const activeConnection = connections.find((c) => c.isActive !== false);
  const canFetch = Boolean(activeConnection) && supportsModelListForConnection(activeConnection);
  const hasCachedCatalog = Boolean(catalogMeta?.lastSyncAt || (discoveredRows && discoveredRows.length > 0));

  const loadCatalog = useCallback(async () => {
    if (!activeConnection) {
      setCatalogLoading(false);
      return;
    }
    const reqId = ++catalogRequestRef.current;
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/model-catalog`, { cache: "no-store" });
      const data = await res.json();
      if (reqId !== catalogRequestRef.current) return;
      startTransition(() => {
        if (res.ok && data.models?.length) {
          setDiscoveredRows(data.models);
          setCatalogMeta({
            lastSyncAt: data.lastSyncAt,
            syncStatus: data.syncStatus,
            modelCount: data.modelCount,
            lastError: data.lastError,
            requestId: data.requestId,
          });
        } else if (res.ok) {
          setCatalogMeta({
            lastSyncAt: data.lastSyncAt,
            syncStatus: data.syncStatus || "never",
            modelCount: 0,
          });
        }
      });
    } catch {
      /* keep registry rows */
    } finally {
      if (reqId === catalogRequestRef.current) setCatalogLoading(false);
    }
  }, [activeConnection]);

  useEffect(() => {
    // Initial catalog hydrate on connection change — async fetch; stale responses ignored via catalogRequestRef.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- catalog load is intentionally tied to connection mount
    void loadCatalog();
  }, [loadCatalog]);

  const staticModels = useMemo(() => {
    const all = [
      ...models,
      ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
    ].filter((m) => {
      const k = getModelKind(m);
      return !k || k === "llm";
    });
    return all;
  }, [models, kiloFreeModels]);

  const disabledSet = useMemo(() => new Set(disabledModelIds), [disabledModelIds]);

  const { configuredRows, repoRows } = useMemo(
    () => buildModelCatalogSections({
      providerId,
      providerStorageAlias,
      providerDisplayAlias,
      staticModels,
      customModelRows,
      discoveredRows: deferredDiscoveredRows,
      disabledModelIds,
      suggestedModels,
    }),
    [
      providerId,
      providerStorageAlias,
      providerDisplayAlias,
      staticModels,
      customModelRows,
      deferredDiscoveredRows,
      disabledModelIds,
      suggestedModels,
    ],
  );

  const summary = useMemo(() => {
    const enabled = configuredRows.filter((r) => !disabledSet.has(r.modelId) && !r.stale).length;
    const disabled = configuredRows.filter((r) => disabledSet.has(r.modelId)).length;
    const reasoning = configuredRows.filter((r) => r.reasoning === "yes").length;
    const multimodal = configuredRows.filter((r) =>
      (r.inputModalities?.length > 1) || r.inputModalities?.some((m) => m !== "text"),
    ).length;
    return {
      total: configuredRows.length,
      enabled,
      disabled,
      reasoning,
      multimodal,
    };
  }, [configuredRows, disabledSet]);

  const filteredConfiguredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return configuredRows;
    return configuredRows.filter((r) =>
      r.modelId.toLowerCase().includes(q)
      || (r.displayName || "").toLowerCase().includes(q)
      || r.fullModel.toLowerCase().includes(q),
    );
  }, [configuredRows, deferredSearch]);

  const repoSummary = useMemo(() => ({
    total: repoRows.length,
    fetched: repoRows.filter((r) => r.catalogSection === "repo-fetched").length,
    suggested: repoRows.filter((r) => r.catalogSection === "repo-suggested").length,
  }), [repoRows]);

  const filteredRepoRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return repoRows;
    return repoRows.filter((r) =>
      r.modelId.toLowerCase().includes(q)
      || (r.displayName || "").toLowerCase().includes(q)
      || r.fullModel.toLowerCase().includes(q),
    );
  }, [repoRows, deferredSearch]);

  const isRepoPending = deferredDiscoveredRows !== discoveredRows
    || deferredSearch !== search;

  const handleAddFromRepo = useCallback((modelId) => {
    onAddSuggested?.(modelId);
  }, [onAddSuggested]);

  const enabledIds = useMemo(
    () => configuredRows.filter((r) => !disabledSet.has(r.modelId) && !r.stale).map((r) => r.modelId),
    [configuredRows, disabledSet],
  );
  const disabledConfiguredIds = useMemo(
    () => configuredRows.filter((r) => disabledSet.has(r.modelId)).map((r) => r.modelId),
    [configuredRows, disabledSet],
  );

  const handleFetch = useCallback(async () => {
    if (!canFetch || fetchState === "fetching") return;
    const reqId = ++catalogRequestRef.current;
    setFetchState("fetching");
    setFetchMessage("");
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`, { cache: "no-store" });
      const data = await res.json();
      if (reqId !== catalogRequestRef.current) return;
      if (!res.ok) {
        setFetchState("failed");
        setFetchMessage(data.error || "Failed to fetch models");
        setRequestId(data.requestId || null);
        return;
      }
      startTransition(() => {
        setDiscoveredRows(data.models || []);
        setCatalogMeta({
          lastSyncAt: data.lastSyncAt || new Date().toISOString(),
          syncStatus: "synced",
          modelCount: data.models?.length ?? 0,
          requestId: data.requestId,
        });
        setRequestId(data.requestId || null);
        const count = data.models?.length ?? 0;
        setFetchState("success");
        setFetchMessage(`${count} models synced`);
      });
    } catch (err) {
      if (reqId !== catalogRequestRef.current) return;
      setFetchState("failed");
      setFetchMessage(err.message || "Failed to fetch models");
    }
  }, [activeConnection, canFetch, fetchState]);

  const handleResetCatalog = useCallback(async () => {
    if (!activeConnection || fetchState === "fetching" || resetState === "loading") return;
    const reqId = ++catalogRequestRef.current;
    setResetState("loading");
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/model-catalog`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (reqId !== catalogRequestRef.current) return;
      if (!res.ok) {
        setFetchState("failed");
        setFetchMessage(data.error || "Failed to reset models list");
        setResetState("error");
        return;
      }
      startTransition(() => {
        setDiscoveredRows(null);
        setCatalogMeta({
          lastSyncAt: null,
          syncStatus: "never",
          modelCount: 0,
        });
        setRequestId(null);
        setFetchState("idle");
        setFetchMessage("Fetched models list cleared");
        setResetState("success");
      });
    } catch (err) {
      if (reqId !== catalogRequestRef.current) return;
      setFetchState("failed");
      setFetchMessage(err.message || "Failed to reset models list");
      setResetState("error");
    } finally {
      if (reqId === catalogRequestRef.current) {
        setTimeout(() => setResetState("idle"), 2000);
      }
    }
  }, [activeConnection, fetchState, resetState]);

  const fetchIdleLabel = hasCachedCatalog ? "Refresh Models" : "Fetch Models";

  const fetchProcessState = fetchState === "fetching"
    ? PROCESS_STATE.FETCHING
    : fetchState === "success"
      ? PROCESS_STATE.SUCCESS
      : fetchState === "failed"
        ? PROCESS_STATE.ERROR
        : PROCESS_STATE.IDLE;

  const fetchProcessLabels = useMemo(() => ({
    idle: fetchIdleLabel,
    fetching: "Fetching",
    success: "Models Synced",
    error: fetchIdleLabel,
  }), [fetchIdleLabel]);

  const resetProcessState = resetState === "loading"
    ? PROCESS_STATE.LOADING
    : resetState === "success"
      ? PROCESS_STATE.SUCCESS
      : resetState === "error"
        ? PROCESS_STATE.ERROR
        : PROCESS_STATE.IDLE;

  const resetProcessLabels = useMemo(() => ({
    idle: "Reset Models List",
    loading: "Resetting",
    success: "List Cleared",
    error: "Reset Models List",
  }), []);

  const showTest = connections.length > 0 || isFreeNoAuth;

  const sharedTableProps = {
    copied,
    onCopy,
    resolveThinkingSuffix,
    disabledSet,
  };

  if (catalogLoading && !discoveredRows && staticModels.length === 0 && customModelRows.length === 0) {
    return <CatalogSkeleton />;
  }

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-col gap-5 overflow-hidden">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-lg font-semibold">Available Models</h2>
              <span className={cn("text-sm font-medium", getSemanticTextClass("success"))}>
                {summary.enabled} Enabled
              </span>
              {summary.disabled > 0 ? (
                <span className="text-sm font-medium text-text-muted">
                  · {summary.disabled} Disabled
                </span>
              ) : null}
            </div>
            <p className="text-xs text-text-muted">Models configuration for routing; browse fetched and suggested models in the repo below</p>
            {summary.total > 0 || repoSummary.total > 0 ? (
              <p className="mt-1 text-[11px] text-text-muted">
                {summary.total} configured · {repoSummary.fetched} fetched · {repoSummary.suggested} suggested
                {summary.reasoning > 0 ? ` · ${summary.reasoning} reasoning` : ""}
                {catalogMeta?.lastSyncAt ? ` · Last synced ${formatDateTime(catalogMeta.lastSyncAt)}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <MdiIcon name="search" size={18} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-black/10 bg-surface py-0 pl-9 pr-8 text-sm focus:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-white/10"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-main" aria-label="Clear search">
                <MdiIcon name="close" size={16} />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {providerThinkingLevels ? (
              <ThinkingModeSelect
                value={thinkingMode}
                options={providerThinkingLevels}
                onChange={onThinkingModeChange}
              />
            ) : null}

            <Tooltip text={canFetch ? (hasCachedCatalog ? "Refresh model list from provider" : "Fetch model list from provider") : "This provider does not expose model discovery"}>
              <span className="inline-flex">
                <Button
                  size="md"
                  variant="secondary"
                  processState={fetchProcessState}
                  processLabels={fetchProcessLabels}
                  icon={hasCachedCatalog ? "refresh" : "cloud_download"}
                  disabled={!canFetch}
                  onClick={handleFetch}
                />
              </span>
            </Tooltip>

            <Tooltip text="Clear fetched models from the repo. Does not change Models Configuration.">
              <span className="inline-flex">
                <Button
                  size="md"
                  variant="secondary"
                  icon="restart_alt"
                  processState={resetProcessState}
                  processLabels={resetProcessLabels}
                  disabled={!canFetch || !hasCachedCatalog || fetchState === "fetching"}
                  onClick={handleResetCatalog}
                  className="hover:border-red-500/30 hover:text-red-500"
                />
              </span>
            </Tooltip>

            <Button size="md" variant="secondary" icon="add" onClick={onAddCustom}>
              Add Model
            </Button>

            {enabledIds.length > 0 && onDisableAll ? (
              <Button size="md" variant="secondary" icon="block" onClick={() => onDisableAll(enabledIds)} className="hover:border-red-500/30 hover:text-red-500">
                Disable All
              </Button>
            ) : null}
            {disabledConfiguredIds.length > 0 && onEnableAll ? (
              <Button size="md" variant="secondary" icon="check" onClick={() => onEnableAll(disabledConfiguredIds)}>
                Enable All
              </Button>
            ) : null}
          </div>
        </div>

        {modelTestAlert ? (
          <ModelTestAlert alert={modelTestAlert} onDismiss={onDismissModelTestAlert} />
        ) : null}

        {(catalogMeta?.lastSyncAt || fetchState === "failed") && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {fetchState === "failed" ? (
              <>
                <span className={cn("inline-flex items-center gap-1", getSemanticTextClass("error"))}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  Sync failed
                </span>
                {catalogMeta?.lastSyncAt ? (
                  <span className="text-text-muted">Last successful sync: {formatDateTime(catalogMeta.lastSyncAt)}</span>
                ) : null}
                {requestId ? <span className="font-mono text-text-muted">Request ID: {requestId}</span> : null}
                <button type="button" onClick={handleFetch} className="text-primary hover:underline">Retry</button>
              </>
            ) : catalogMeta?.syncStatus === "synced" ? (
              <span className={cn("inline-flex items-center gap-1", getSemanticTextClass("success"))}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                Synced · {catalogMeta.modelCount ?? repoSummary.fetched} fetched
                {catalogMeta.lastSyncAt ? ` · ${formatDateTime(catalogMeta.lastSyncAt)}` : ""}
              </span>
            ) : null}
            {fetchMessage && fetchState !== "fetching" ? (
              <span className={cn(fetchState === "failed" ? getSemanticTextClass("error") : getSemanticTextClass("success"))}>{fetchMessage}</span>
            ) : null}
          </div>
        )}
      </div>

      <ModelCatalogTablePanel
        title="Models Configuration"
        description="Enable, disable, or remove models for this provider"
        count={filteredConfiguredRows.length}
        emptyMessage={search.trim() ? "No models match your search" : "No models configured. Fetch from provider or add manually."}
        tableProps={{
          ...sharedTableProps,
          variant: "configured",
          rows: filteredConfiguredRows,
          onDisable,
          onEnable: onEnableModel,
          onDeleteCustom,
          onTest,
          modelTestResults,
          testingModelIds,
          showTest,
        }}
      />

      <ModelCatalogTablePanel
        title="Available Models Repo"
        description="Provider catalog and suggestions — state shows Fetched or Suggested"
        count={filteredRepoRows.length}
        emptyMessage={search.trim() ? "No repo models match your search" : canFetch ? "No models in repo yet. Fetch from provider or wait for suggestions." : "No suggested models available for this provider."}
        tableProps={{
          ...sharedTableProps,
          variant: "repo",
          rows: filteredRepoRows,
          onAdd: handleAddFromRepo,
        }}
      />
      {isRepoPending ? (
        <p className="text-[11px] text-text-muted">Updating model list...</p>
      ) : null}
    </div>
  );
}

ModelsTableSection.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  models: PropTypes.array.isRequired,
  kiloFreeModels: PropTypes.array,
  customModelRows: PropTypes.array,
  disabledModelIds: PropTypes.array,
  connections: PropTypes.array,
  isFreeNoAuth: PropTypes.bool,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  modelTestResults: PropTypes.object,
  testingModelIds: PropTypes.instanceOf(Set),
  onTest: PropTypes.func,
  onDisable: PropTypes.func,
  onDeleteCustom: PropTypes.func,
  onAddCustom: PropTypes.func.isRequired,
  onEnableModel: PropTypes.func,
  onDisableAll: PropTypes.func,
  onEnableAll: PropTypes.func,
  resolveThinkingSuffix: PropTypes.func,
  suggestedModels: PropTypes.array,
  onAddSuggested: PropTypes.func,
  thinkingMode: PropTypes.string,
  providerThinkingLevels: PropTypes.array,
  onThinkingModeChange: PropTypes.func,
  modelTestAlert: PropTypes.shape({
    type: PropTypes.oneOf(["success", "error"]).isRequired,
    modelLabel: PropTypes.string.isRequired,
    message: PropTypes.string,
    httpStatus: PropTypes.number,
    providerMessage: PropTypes.string,
    retryScheduled: PropTypes.bool,
    retryAt: PropTypes.string,
    retryAttempt: PropTypes.number,
    retryMaxAttempts: PropTypes.number,
  }),
  onDismissModelTestAlert: PropTypes.func,
};
