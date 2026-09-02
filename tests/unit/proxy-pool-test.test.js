import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
const startProviderOperationMock = vi.hoisted(() =>
  vi.fn(() => ({ logTerminal: vi.fn() })),
);

vi.mock("@/lib/goEngine/goTransport.js", () => ({
  canUseGoEngineTransport: () => true,
}));

vi.mock("open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => mockFetch(...args),
}));

vi.mock("@/lib/network/connectionProxy.js", () => ({
  redactProxyUrlForLog: (url) => String(url).replace(/\/\/[^@]+@/, "//"),
}));

vi.mock("@/lib/providerOperationLog.js", () => ({
  startProviderOperation: startProviderOperationMock,
}));

const { testProxyPoolEntry, PROXY_TEST_TARGET, isRelayProxyType } = await import(
  "../../src/lib/network/proxyPoolTest.js"
);
import { getProxyLatencySemantic } from "../../src/shared/utils/statusSemantic.js";

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (k) => headers[k] ?? null,
    },
    json: async () => body,
  };
}

describe("proxyPoolTest", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("relay test targets httpbin through relay, not relay root (404 regression)", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { url: "https://httpbin.org/get" }, {
      "X-HAI-Transport-Connect-Ms": "84",
    }));

    const relayUrl = "https://relay.example.workers.dev";
    const result = await testProxyPoolEntry({
      proxyPool: { id: "p1", type: "cloudflare", proxyUrl: relayUrl },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [targetUrl, , proxyOptions] = mockFetch.mock.calls[0];
    expect(targetUrl).toBe(PROXY_TEST_TARGET.relay);
    expect(targetUrl).not.toBe(relayUrl);
    expect(proxyOptions.vercelRelayUrl).toBe(relayUrl);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBe(84);
    expect(result.egressMode).toBe("relay");
  });

  it("treats relay root 404 as failure when misconfigured (old broken contract)", async () => {
    mockFetch.mockResolvedValue(jsonResponse(404, {}, {}));

    const result = await testProxyPoolEntry({
      proxyPool: { id: "p1", type: "cloudflare", proxyUrl: "https://relay.example.workers.dev" },
    });

    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBeNull();
    expect(result.errorMessage).toMatch(/404/);
  });

  it("http proxy accepts non-2xx transport success (204)", async () => {
    mockFetch.mockResolvedValue(jsonResponse(204, null, {
      "X-HAI-Transport-Connect-Ms": "42",
    }));

    const result = await testProxyPoolEntry({
      proxyPool: { id: "p2", type: "http", proxyUrl: "http://proxy.example:8080" },
    });

    expect(mockFetch.mock.calls[0][0]).toBe(PROXY_TEST_TARGET.http);
    expect(mockFetch.mock.calls[0][1].method).toBe("HEAD");
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBe(42);
  });

  it("does not expose proxy credentials in log fields", async () => {
    startProviderOperationMock.mockClear();
    mockFetch.mockResolvedValue(jsonResponse(204, null, {}));

    await testProxyPoolEntry({
      proxyPool: {
        id: "p3",
        type: "http",
        proxyUrl: "http://user:PROXY_SECRET@host:8080",
      },
    });

    const callArg = startProviderOperationMock.mock.calls[0][0];
    expect(JSON.stringify(callArg)).not.toContain("PROXY_SECRET");
    expect(callArg.sanitizedProxy).not.toContain("PROXY_SECRET");
  });

  it("isRelayProxyType identifies relay types", () => {
    expect(isRelayProxyType("cloudflare")).toBe(true);
    expect(isRelayProxyType("http")).toBe(false);
  });

  it("timeout returns no successful latency", async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const result = await testProxyPoolEntry({
      proxyPool: { id: "p4", type: "http", proxyUrl: "http://127.0.0.1:9" },
      timeoutMs: 50,
    });

    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBeNull();
    expect(result.failedAfterMs).toBeGreaterThanOrEqual(0);
    expect(result.errorCode).toBe("timeout");
  });
});

describe("getProxyLatencySemantic", () => {
  it("classifies latency thresholds", () => {
    expect(getProxyLatencySemantic(50)).toBe("success");
    expect(getProxyLatencySemantic(150)).toBe("info");
    expect(getProxyLatencySemantic(500)).toBe("warning");
    expect(getProxyLatencySemantic(null)).toBe("default");
  });
});
