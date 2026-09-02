import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";

const workerState = { baseUrl: "", authToken: "test-token" };
const engineState = { active: 0, completeCalls: 0 };

vi.mock("@/lib/goEngine/goEngineManager.js", () => ({
  isGoEngineEnabled: () => true,
  getGoEngineManager: () => ({
    assertAdmission: () => {},
    pickWorker: () => ({
      index: 0,
      baseUrl: workerState.baseUrl,
      authToken: workerState.authToken,
    }),
    trackRequest: () => { engineState.active += 1; },
    completeRequest: () => {
      engineState.active = Math.max(0, engineState.active - 1);
      engineState.completeCalls += 1;
    },
    getActiveCount: () => engineState.active,
  }),
  getGoWorkerManager: async () => ({
    pickWorker: () => ({
      index: 0,
      baseUrl: workerState.baseUrl,
      authToken: workerState.authToken,
    }),
  }),
}));

describe("go engine stream body lifetime", () => {
  /** @type {http.Server|null} */
  let mockWorker = null;

  beforeEach(async () => {
    process.env.HAI_GO_ENGINE = "1";
    process.env.HAI_GO_ENGINE_INTEGRATION = "1";
    engineState.active = 0;
    engineState.completeCalls = 0;

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
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "X-HAI-Transport-Protocol": "1",
          });
          res.write("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n");
          setTimeout(() => {
            res.write("data: [DONE]\n\n");
            res.end();
          }, 80);
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

  it("keeps active request > 0 until response body EOF", async () => {
    const { goEngineFetch } = await import("@/lib/goEngine/goTransport.js");
    const res = await goEngineFetch("https://example.com/v1/chat", {
      method: "POST",
      headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      body: "{}",
    }, { providerId: "opencode", connectionId: "c-stream" });

    expect(res.status).toBe(200);
    expect(engineState.active).toBe(1);
    expect(engineState.completeCalls).toBe(0);

    const text = await res.text();
    expect(text).toContain("data:");

    expect(engineState.active).toBe(0);
    expect(engineState.completeCalls).toBe(1);
  }, 10000);
});
