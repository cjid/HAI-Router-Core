"use client";

import MdiIcon from "@/shared/components/MdiIcon";

import { useState, useEffect, useCallback, useRef } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Select from "@/shared/components/Select";
import Drawer from "@/shared/components/Drawer";
import Pagination from "@/shared/components/Pagination";
import { cn } from "@/shared/utils/cn";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";
import RequestDetailPanel from "./RequestDetailPanel";
import { buildRequestDetailMetrics, getRequestStatusLabel, getRequestStatusTextClass } from "@/shared/utils/requestDetailMetrics";
import { useDateTimeFormat } from "@/shared/hooks/useDateTimeFormat";
import { createPollScheduler } from "@/shared/utils/pollScheduler.js";
import {
  shouldApplyListFetch,
  shouldApplyRequestDetailUpdate,
} from "@/shared/utils/asyncFetch.js";
import {
  createDetailRequestTracker,
  createTerminalDetailCache,
  fetchRequestDetailById,
  detailHasFullPayload,
  RequestDetailFetchError,
} from "@/shared/utils/requestDetailDrawer.js";

let providerNameCache = null;
let providerNodesCache = null;

async function fetchProviderNames() {
  if (providerNameCache && providerNodesCache) {
    return { providerNameCache, providerNodesCache };
  }

  const nodesRes = await fetch("/api/provider-nodes");
  const nodesData = await nodesRes.json();
  const nodes = nodesData.nodes || [];
  providerNodesCache = {};

  for (const node of nodes) {
    providerNodesCache[node.id] = node.name;
  }

  providerNameCache = {
    ...AI_PROVIDERS,
    ...providerNodesCache
  };

  return { providerNameCache, providerNodesCache };
}

function getProviderName(providerId, cache) {
  if (!providerId) return providerId;
  if (!cache) return providerId;

  const cached = cache[providerId];

  if (typeof cached === 'string') {
    return cached;
  }

  if (cached?.name) {
    return cached.name;
  }

  const providerConfig = getProviderByAlias(providerId) || AI_PROVIDERS[providerId];
  return providerConfig?.name || providerId;
}

export default function RequestDetailsTab() {
  const { formatDateTime } = useDateTimeFormat();
  const [details, setDetails] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0
  });
  const [loading, setLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [isLoadingFullDetail, setIsLoadingFullDetail] = useState(false);
  const [fullDetailError, setFullDetailError] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [providers, setProviders] = useState([]);
  const [providerNameCache, setProviderNameCache] = useState(null);
  const [filters, setFilters] = useState({
    provider: "",
    startDate: "",
    endDate: ""
  });
  const listFetchGeneration = useRef(0);
  const detailRequestTracker = useRef(null);
  const terminalDetailCache = useRef(null);
  const selectedDetailRef = useRef(null);

  if (!detailRequestTracker.current) {
    detailRequestTracker.current = createDetailRequestTracker();
  }
  if (!terminalDetailCache.current) {
    terminalDetailCache.current = createTerminalDetailCache();
  }

  selectedDetailRef.current = selectedDetail;

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/usage/providers");
      const data = await res.json();
      setProviders(data.providers || []);

      const cache = await fetchProviderNames();
      setProviderNameCache(cache.providerNameCache);
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    }
  }, []);

  const fetchDetails = useCallback(async ({ silent = false } = {}) => {
    const capturedGeneration = listFetchGeneration.current;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString()
      });
      if (filters.provider) params.append("provider", filters.provider);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);

      const res = await fetch(`/api/usage/request-details?${params}`);
      const data = await res.json();

      if (!shouldApplyListFetch({
        capturedGeneration,
        activeGeneration: listFetchGeneration.current,
      })) {
        return;
      }

      setDetails(data.details || []);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch (error) {
      console.error("Failed to fetch request details:", error);
    } finally {
      if (!silent && capturedGeneration === listFetchGeneration.current) {
        setLoading(false);
      }
    }
  }, [pagination.page, pagination.pageSize, filters]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => () => {
    detailRequestTracker.current?.cancelActive();
  }, []);

  useEffect(() => {
    listFetchGeneration.current += 1;
    fetchDetails();
  }, [fetchDetails]);

  const hasStreamingRows = details.some((detail) => detail.status === "streaming");

  useEffect(() => {
    if (!hasStreamingRows) return undefined;

    const scheduler = createPollScheduler({
      intervalMs: 1000,
      poll: () => fetchDetails({ silent: true }),
      isActive: () => typeof document === "undefined" || !document.hidden,
    });
    scheduler.start();
    return () => scheduler.stop();
  }, [hasStreamingRows, fetchDetails]);

  useEffect(() => {
    if (!isDrawerOpen || !selectedDetail?.id || selectedDetail.status !== "streaming") {
      return undefined;
    }

    const detailId = selectedDetail.id;
    const scheduler = createPollScheduler({
      intervalMs: 1000,
      poll: async () => {
        try {
          const res = await fetch(`/api/usage/request-details/${encodeURIComponent(detailId)}`);
          if (!res.ok) return;
          const data = await res.json();
          if (!data.detail) return;

          const current = selectedDetailRef.current;
          if (!shouldApplyRequestDetailUpdate({
            capturedId: detailId,
            activeId: detailRequestTracker.current.getActiveId(),
            incomingStatus: data.detail.status,
            currentStatus: current?.status,
          })) {
            return;
          }

          setSelectedDetail(data.detail);
        } catch {
          // keep existing drawer content visible during transient poll errors
        }
      },
      isActive: () => {
        if (typeof document !== "undefined" && document.hidden) return false;
        const current = selectedDetailRef.current;
        return isDrawerOpen
          && detailRequestTracker.current.getActiveId() === detailId
          && current?.status === "streaming";
      },
    });

    scheduler.start();
    return () => scheduler.stop();
  }, [isDrawerOpen, selectedDetail?.id, selectedDetail?.status]);

  const loadFullDetail = useCallback(async (summaryRow, { fromRetry = false } = {}) => {
    const viewId = summaryRow.id;
    const cache = terminalDetailCache.current;
    const cached = !fromRetry ? cache.get(viewId) : null;

    if (cached) {
      setSelectedDetail(cached);
      setIsLoadingFullDetail(false);
      setFullDetailError(null);
      return;
    }

    const req = detailRequestTracker.current.startRequest(viewId);
    setFullDetailError(null);
    setIsLoadingFullDetail(true);

    try {
      const full = await fetchRequestDetailById(viewId, { signal: req.signal });
      if (!req.isCurrent()) return;
      const merged = full || summaryRow;
      setSelectedDetail(merged);
      cache.set(merged);
    } catch (err) {
      if (!req.isCurrent()) return;
      if (err instanceof RequestDetailFetchError && err.aborted) return;
      setFullDetailError(err instanceof RequestDetailFetchError && err.timedOut ? "timeout" : "failed");
    } finally {
      if (req.isCurrent()) {
        setIsLoadingFullDetail(false);
      }
    }
  }, []);

  const handleViewDetail = (detail) => {
    setSelectedDetail(detail);
    setIsDrawerOpen(true);
    setFullDetailError(null);
    loadFullDetail(detail);
  };

  const handleDrawerClose = () => {
    detailRequestTracker.current.cancelActive();
    setIsDrawerOpen(false);
    setSelectedDetail(null);
    setIsLoadingFullDetail(false);
    setFullDetailError(null);
  };

  const handleRetryFullDetail = () => {
    const current = selectedDetailRef.current;
    if (!current?.id) return;
    loadFullDetail(current, { fromRetry: true });
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newPageSize) => {
    setPagination(prev => ({ ...prev, pageSize: newPageSize, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilters({ provider: "", startDate: "", endDate: "" });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card padding="md">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-2">
            <Select
              id="provider-filter"
              label="Provider"
              size="sm"
              fullWidth
              value={filters.provider}
              onChange={(e) => setFilters({ ...filters, provider: e.target.value })}
              options={[
                { value: "", label: "All Providers" },
                ...providers.map((provider) => ({
                  value: provider.id,
                  label: provider.name,
                })),
              ]}
            />
          </div>
          
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="start-date-filter" className="text-sm font-medium text-text-main">Start Date</label>
            <input
              id="start-date-filter"
              type="datetime-local"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className={cn(
                "h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface",
                "w-full min-w-0 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
              )}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="end-date-filter" className="text-sm font-medium text-text-main">End Date</label>
            <input
              id="end-date-filter"
              type="datetime-local"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className={cn(
                "h-9 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-surface",
                "w-full min-w-0 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
              )}
            />
          </div>
          
          <div className="flex min-w-0 flex-col gap-2 sm:col-span-2 lg:col-span-1">
            <span className="hidden text-sm font-medium text-text-main opacity-0 lg:block" aria-hidden="true">Clear</span>
            <Button 
              variant="ghost" 
              onClick={handleClearFilters}
              disabled={!filters.provider && !filters.startDate && !filters.endDate}
              className="w-full"
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/5">
                <th className="text-left p-4 text-sm font-semibold text-text-main">Timestamp</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Model</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Provider</th>
                <th className="text-left p-4 text-sm font-semibold text-text-main">Status</th>
                <th className="text-right p-4 text-sm font-semibold text-text-main">Tokens</th>
                <th className="text-right p-4 text-sm font-semibold text-text-main">Latency</th>
                <th className="text-center p-4 text-sm font-semibold text-text-main">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-text-muted">
                    <div className="flex items-center justify-center gap-2">
                      <MdiIcon name="progress_activity" size={20} spin className="animate-spin" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : details.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-text-muted">
                    No request details found
                  </td>
                </tr>
              ) : (
                details.map((detail, index) => {
                  const metrics = buildRequestDetailMetrics(detail);
                  const statusLabel = getRequestStatusLabel(detail);
                  const statusCls = getRequestStatusTextClass(detail);

                  return (
                  <tr
                    key={`${detail.id}-${index}`}
                    className="border-b border-black/5 dark:border-white/5 last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="whitespace-nowrap p-4 text-sm text-text-main">
                      {formatDateTime(detail.timestamp)}
                    </td>
                    <td className="max-w-[260px] truncate p-4 font-mono text-sm text-text-main">
                      {detail.model}
                    </td>
                    <td className="max-w-[180px] truncate p-4 text-sm text-text-main">
                       <span className="font-medium">
                         {getProviderName(detail.provider, providerNameCache)}
                       </span>
                     </td>
                    <td className="p-4 text-sm">
                      <span className={cn("font-medium capitalize", statusCls)}>{statusLabel}</span>
                    </td>
                    <td className="p-4 text-sm text-text-main text-right font-mono whitespace-nowrap">
                      {metrics.fmt.tokens(metrics.inputTokens, metrics.outputTokens, metrics.estimated)}
                    </td>
                    <td className="p-4 text-sm text-text-muted whitespace-nowrap">
                      <div className="flex flex-col gap-0.5 text-right">
                        <div className="font-mono">{metrics.fmt.ms(metrics.totalMs)}</div>
                        <div className="text-[11px]">TTFT {metrics.fmt.ms(metrics.ttftMs)}</div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetail(detail)}
                      >
                        Detail
                      </Button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && details.length > 0 && (
          <div className="border-t border-black/5 dark:border-white/5">
            <Pagination
              currentPage={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        )}
      </Card>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
        title="Request Details"
        width="xl"
      >
        <RequestDetailPanel
          detail={selectedDetail}
          isLoadingFullDetail={isLoadingFullDetail && !detailHasFullPayload(selectedDetail)}
          fullDetailError={fullDetailError}
          onRetry={handleRetryFullDetail}
          providerName={selectedDetail ? getProviderName(selectedDetail.provider, providerNameCache) : null}
        />
      </Drawer>
    </div>
  );
}
