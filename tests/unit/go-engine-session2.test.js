import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";

const workerState = { baseUrl: "", authToken: "test-token" };

vi.mock("@/lib/goEngine/goEngineManager.js", () => ({
  isGoEngineEnabled: () => true,
  getGoEngineManager: () => ({
    assertAdmission: () => {},
    pickWorker: () => ({
      index: 0,
      baseUrl: workerState.baseUrl,
      authToken: workerState.authToken,
    }),
    trackRequest: () => {},
    completeRequest: () => {},
  }),
  getGoWorkerManager: async () => ({
    pickWorker: () => ({
      index: 0,
      baseUrl: workerState.baseUrl,
      authToken: workerState.authToken,
    }),
  }),
}));

describe("goEngine Session 2 transport", () => {
  /** @type {http.Server|null} */
  let mockWorker = null;
  /** @type {object|null} */
  let lastSpec = null;

  beforeEach(async () => {
    process.env.HAI_GO_ENGINE = "1";
    delete process.env.HAI_GO_ENGINE_FALLBACK;
    lastSpec = null;

    mockWorker = http.createServer((req, res) => {
      if (req.url === "/v1/execute" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
          if (req.headers["x-hai-worker-token"] !== workerState.authToken) {
            res.writeHead(401);
            res.end("unauthorized");
            return;
          }
          lastSpec = JSON.parse(body);
          res.writeHead(200, {
            "Content-Type": "text/plain",
            "X-HAI-Transport-Protocol": "1",
          });
          res.end(`upstream:${lastSpec.url}`);
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => {
      mockWorker.listen(0, "127.0.0.1", () => {
        const addr = mockWorker.address();
        workerState.baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (mockWorker) {
      await new Promise((resolve) => mockWorker.close(resolve));
      mockWorker = null;
    }
    delete process.env.HAI_GO_ENGINE;
    delete process.env.HAI_GO_ENGINE_FALLBACK;
  });

  it("builds relay egress for vercel relay proxy options", async () => {
    const { goEngineFetch } = await import("@/lib/goEngine/goTransport.js");
    await goEngineFetch("https://api.provider.test/v1/chat", {
      method: "POST",
      body: "{}",
    }, {
      providerId: "openai",
      connectionId: "c-relay",
      vercelRelayUrl: "https://relay.example/worker",
      egressGeneration: 7,
    });

    expect(lastSpec.egress.mode).toBe("relay");
    expect(lastSpec.egress.relayUrl).toBe("https://relay.example/worker");
    expect(lastSpec.egress.generation).toBe(7);
  });

  it("builds proxy egress with connection proxy url", async () => {
    const { goEngineFetch } = await import("@/lib/goEngine/goTransport.js");
    await goEngineFetch("https://api.provider.test/v1/chat", {
      method: "POST",
      body: "{}",
    }, {
      providerId: "opencode",
      connectionId: "c-proxy",
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://127.0.0.1:7890",
      egressGeneration: 2,
    });

    expect(lastSpec.egress.mode).toBe("proxy");
    expect(lastSpec.egress.proxyUrl).toBe("http://127.0.0.1:7890");
  });

  it("proxyAwareFetch does not silently fallback when strict go engine is enabled", async () => {
    process.env.HAI_GO_ENGINE_FALLBACK = "0";
    workerState.baseUrl = "http://127.0.0.1:1"; // unreachable

    const { proxyAwareFetch } = await import("../../open-sse/utils/proxyFetch.js");
    await expect(proxyAwareFetch("https://provider.test/api", {
      method: "POST",
      body: "{}",
    }, { providerId: "test", connectionId: "c-strict" })).rejects.toThrow();
  });
});
