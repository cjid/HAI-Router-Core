/**
 * Dashboard/API provider transport — semantics stay in route handlers;
 * network I/O goes through canonical Go provider engine.
 */
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

/**
 * @param {string|URL} url
 * @param {RequestInit} [options]
 * @param {{ providerId?: string, provider?: string, connectionId?: string, [key: string]: unknown }} [meta]
 */
export async function providerFetch(url, options = {}, meta = {}) {
  const providerId = meta.providerId || meta.provider || "dashboard-api";
  return proxyAwareFetch(url, options, {
    ...meta,
    providerId,
    connectionId: meta.connectionId || "",
    operation: meta.operation || "provider_request",
  });
}

export default providerFetch;
