// Shim → re-export from new SQLite-based DB layer (src/lib/db/)
export {
  statsEmitter, trackPendingRequest, emitPendingStatsNow, getActiveRequests,
  saveRequestUsage, getUsageHistory, getUsageStats, getChartData, getUsageOverview,
  getApiKeyUsageSummary,
  appendRequestLog, getRecentLogs,
  saveRequestDetail, flushRequestDetailNow, getRequestDetails, getRequestDetailById,
} from "@/lib/db/index.js";
