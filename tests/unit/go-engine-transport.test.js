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

describe("goEngine transport bridge", () => {
  /** @type {http.Server|null} */
  let mockWorker = null;

  beforeEach(async () => {
    process.env.HAI_GO_ENGINE = "1";
    process.env.HAI_GO_ENGINE_INTEGRATION = "1";

    mockWorker = http.createServer((req, res) => {
      if (req.url === "/v1/execute" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
          const spec = JSON.parse(body);
          if (req.headers["x-hai-worker-token"] !== workerState.authToken) {
            res.writeHead(401);
            res.end("unauthorized");
            return;
          }
          res.writeHead(200, {
            "Content-Type": "text/plain",
            "X-HAI-Transport-Protocol": "1",
          });
          res.end(`upstream:${spec.url}`);
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
    delete process.env.HAI_GO_ENGINE_INTEGRATION;
  });

  it("routes provider fetch through worker execute endpoint", async () => {
    const { goEngineFetch } = await import("@/lib/goEngine/goTransport.js");
    const res = await goEngineFetch("https://example.com/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"x":1}',
    }, { providerId: "openai", connectionId: "c1" });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-HAI-Transport-Protocol")).toBe("1");
    const text = await res.text();
    expect(text).toContain("https://example.com/v1/chat");
  });

  it("proxyAwareFetch delegates to go engine when enabled", async () => {
    const { proxyAwareFetch } = await import("../../open-sse/utils/proxyFetch.js");
    const res = await proxyAwareFetch("https://provider.test/api", {
      method: "POST",
      body: "{}",
    }, { providerId: "opencode", connectionId: "c2" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("https://provider.test/api");
  });

  it("preserves URLSearchParams OAuth bodies in ExecutionSpec", async () => {
    const { goEngineFetch } = await import("@/lib/goEngine/goTransport.js");
    let capturedBody = null;

    mockWorker.removeAllListeners("request");
    mockWorker.on("request", (req, res) => {
      if (req.url === "/v1/execute" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
          const spec = JSON.parse(body);
          capturedBody = spec.body;
          res.writeHead(200, { "Content-Type": "text/plain", "X-HAI-Transport-Protocol": "1" });
          res.end("ok");
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code: "abc 123",
      redirect_uri: "http://localhost/callback",
    });

    await goEngineFetch("https://oauth.example/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    }, { providerId: "test" });

    const parsed = new URLSearchParams(capturedBody);
    expect(parsed.get("grant_type")).toBe("authorization_code");
    expect(parsed.get("code")).toBe("abc 123");
    expect(parsed.get("redirect_uri")).toBe("http://localhost/callback");
    expect(capturedBody).not.toBe("{}");
  });
});
