import { testProxyPoolEntry } from "@/lib/network/proxyPoolTest.js";

/**
 * Ad-hoc outbound proxy test (profile settings).
 * Uses Go Engine egress — same transport as provider requests.
 */
export async function testProxyUrl({ proxyUrl, testUrl, timeoutMs } = {}) {
  const normalizedProxyUrl = typeof proxyUrl === "string" ? proxyUrl.trim() : "";
  if (!normalizedProxyUrl) {
    return { ok: false, status: 400, error: "proxyUrl is required" };
  }

  const result = await testProxyPoolEntry({
    proxyPool: {
      id: "settings",
      type: "http",
      proxyUrl: normalizedProxyUrl,
      strictProxy: true,
    },
    timeoutMs,
    testUrlOverride: testUrl,
  });

  if (result.ok) {
    return {
      ok: true,
      status: result.statusCode ?? 200,
      statusText: "OK",
      url: testUrl || undefined,
      elapsedMs: result.elapsedMs,
      latencyMs: result.latencyMs,
    };
  }

  return {
    ok: false,
    status: result.statusCode ?? 500,
    error: result.errorMessage || "Proxy test failed",
    elapsedMs: result.elapsedMs,
    failedAfterMs: result.failedAfterMs,
  };
}
