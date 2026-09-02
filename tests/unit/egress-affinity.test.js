import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("../../open-sse/utils/proxyFetch.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    proxyAwareFetch: (...args) => fetchMock(...args),
  };
});

const {
  buildProxyOptions,
  buildProxyOptionsFromCredentials,
  cacheConnectionEgress,
  getCachedConnectionEgress,
  invalidateConnectionEgress,
  attachOAuthProxyPoolId,
} = await import("../../src/lib/network/connectionProxy.js");

const { modalityFetch } = await import("../../open-sse/handlers/modalityProxy.js");

const { refreshProviderCredentials } = await import("../../open-sse/services/oauthCredentialManager.js");
const { refreshTokenByProvider } = await import("../../open-sse/services/tokenRefresh.js");

beforeEach(() => {
  fetchMock.mockReset();
  invalidateConnectionEgress("conn-a");
  invalidateConnectionEgress("conn-b");
});

describe("buildProxyOptions", () => {
  it("includes strictProxy when set on resolved config", () => {
    const opts = buildProxyOptions({
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://127.0.0.1:7890",
      strictProxy: true,
      proxyPoolId: "pool-1",
    });
    expect(opts.strictProxy).toBe(true);
    expect(opts.connectionProxyPoolId).toBe("pool-1");
  });

  it("builds identical options from credentials providerSpecificData", () => {
    const creds = {
      providerSpecificData: {
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://proxy.test:8080",
        connectionNoProxy: "localhost",
        vercelRelayUrl: "",
        strictProxy: true,
        connectionProxyPoolId: "p99",
      },
    };
    const a = buildProxyOptionsFromCredentials(creds);
    const b = buildProxyOptionsFromCredentials(creds);
    expect(a).toEqual(b);
    expect(a.strictProxy).toBe(true);
  });
});

describe("connection egress cache", () => {
  it("stores and retrieves proxyOptions per connectionId", () => {
    const opts = buildProxyOptions({ connectionProxyEnabled: true, connectionProxyUrl: "http://x:1" });
    cacheConnectionEgress("conn-a", opts);
    expect(getCachedConnectionEgress("conn-a")).toMatchObject(opts);
    invalidateConnectionEgress("conn-a");
    expect(getCachedConnectionEgress("conn-a")).toBeNull();
  });

  it("isolates different connections", () => {
    cacheConnectionEgress("conn-a", buildProxyOptions({ connectionProxyUrl: "http://a:1", connectionProxyEnabled: true }));
    cacheConnectionEgress("conn-b", buildProxyOptions({ connectionProxyUrl: "http://b:2", connectionProxyEnabled: true }));
    expect(getCachedConnectionEgress("conn-a")?.connectionProxyUrl).toBe("http://a:1");
    expect(getCachedConnectionEgress("conn-b")?.connectionProxyUrl).toBe("http://b:2");
  });
});

describe("refreshProviderCredentials — proxy propagation", () => {
  it("passes proxyOptions from credentials to token refresh fetch", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
      }),
    });

    const credentials = {
      connectionId: "conn-a",
      refreshToken: "rt-test",
      providerSpecificData: {
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://127.0.0.1:7890",
        strictProxy: false,
      },
    };

    const result = await refreshProviderCredentials("codex", credentials, {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    });

    expect(result?.accessToken).toBe("at");
    expect(fetchMock).toHaveBeenCalled();
    const proxyArg = fetchMock.mock.calls[0][2];
    expect(proxyArg?.connectionProxyEnabled).toBe(true);
    expect(proxyArg?.connectionProxyUrl).toBe("http://127.0.0.1:7890");
  });

  it("honors explicit proxyOptions override", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at", expires_in: 3600 }),
    });

    const credentials = {
      connectionId: "conn-a",
      refreshToken: "rt",
      providerSpecificData: {
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://wrong:1",
      },
    };

    const override = buildProxyOptions({
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://correct:2",
    });

    await refreshProviderCredentials("codex", credentials, { debug: () => {} }, override);
    expect(fetchMock.mock.calls[0][2]?.connectionProxyUrl).toBe("http://correct:2");
  });
});

describe("refreshTokenByProvider", () => {
  it("threads proxyOptions to claude refresh handler", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "x", expires_in: 60 }),
    });

    const proxyOptions = buildProxyOptions({
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://p:9",
    });

    await refreshTokenByProvider(
      "claude",
      { refreshToken: "r" },
      { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      proxyOptions,
    );

    expect(fetchMock.mock.calls[0][2]).toEqual(proxyOptions);
  });
});

describe("attachOAuthProxyPoolId", () => {
  it("merges proxyPoolId into providerSpecificData", () => {
    const out = attachOAuthProxyPoolId({ accessToken: "t", providerSpecificData: { foo: 1 } }, "pool-oauth");
    expect(out.providerSpecificData.proxyPoolId).toBe("pool-oauth");
    expect(out.providerSpecificData.foo).toBe(1);
  });

  it("skips __none__ and empty ids", () => {
    const base = { accessToken: "t" };
    expect(attachOAuthProxyPoolId(base, "__none__")).toBe(base);
    expect(attachOAuthProxyPoolId(base, null)).toBe(base);
  });
});

describe("modalityFetch", () => {
  it("routes through proxyAwareFetch with credentials proxy config", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const credentials = {
      providerSpecificData: {
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://modality:1",
        connectionProxyPoolId: "pool-mod",
      },
    };
    await modalityFetch("https://api.example/v1/embeddings", { method: "POST" }, credentials);
    expect(fetchMock.mock.calls[0][2]?.connectionProxyUrl).toBe("http://modality:1");
  });
});
