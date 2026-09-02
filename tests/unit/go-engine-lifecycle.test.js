import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockEngine = {
  state: "RUNNING",
  assertAdmission: vi.fn(),
  pickWorker: vi.fn(() => ({ index: 0, baseUrl: "http://127.0.0.1:9", authToken: "tok" })),
  trackRequest: vi.fn(),
  completeRequest: vi.fn(),
  getActiveCount: vi.fn(() => 0),
};

vi.mock("@/lib/goEngine/goEngineManager.js", () => ({
  ENGINE_STATES: {
    STOPPED: "STOPPED",
    RUNNING: "RUNNING",
    PAUSED: "PAUSED",
    PAUSING: "PAUSING",
    FAILED: "FAILED",
  },
  isGoEngineEnabled: () => true,
  getGoEngineManager: () => mockEngine,
  getGoWorkerManager: async () => ({
    pickWorker: () => ({ index: 0, baseUrl: "http://127.0.0.1:9", authToken: "tok" }),
    workers: [{ index: 0, baseUrl: "http://127.0.0.1:9", authToken: "tok", child: { pid: 123 } }],
  }),
  ensureGoEngineStarted: async () => mockEngine,
}));

describe("goEngine lifecycle manager", () => {
  beforeEach(() => {
    delete process.env.HAI_GO_ENGINE;
    mockEngine.assertAdmission.mockClear();
    mockEngine.trackRequest.mockClear();
    mockEngine.completeRequest.mockClear();
  });

  afterEach(() => {
    delete process.env.HAI_GO_ENGINE;
  });

  it("Go engine is canonical by default (no env required)", async () => {
    const { isGoEngineEnabled, isGoEngineExplicitlyDisabled } = await import("@/lib/goEngine/workerManager.js");
    expect(isGoEngineEnabled()).toBe(true);
    expect(isGoEngineExplicitlyDisabled()).toBe(false);
  });

  it("Go engine can be disabled with HAI_GO_ENGINE=0", async () => {
    process.env.HAI_GO_ENGINE = "0";
    const { isGoEngineEnabled } = await import("@/lib/goEngine/workerManager.js");
    expect(isGoEngineEnabled()).toBe(false);
  });

  it("goEngineLogger sanitizes authorization tokens", async () => {
    const { logGoEngineEvent } = await import("@/lib/goEngine/goEngineLogger.js");
    const lines = [];
    const orig = console.info;
    console.info = (msg) => lines.push(String(msg));
    try {
      logGoEngineEvent({
        level: "info",
        component: "GO:TRANSPORT",
        message: "Authorization: Bearer secret-token-xyz",
      });
      expect(lines[0]).toContain("[redacted]");
      expect(lines[0]).not.toContain("secret-token");
    } finally {
      console.info = orig;
    }
  });

  it("proxyAwareFetch does not fallback to Node transport when Go is enabled", async () => {
    process.env.HAI_GO_ENGINE_INTEGRATION = "1";
    mockEngine.assertAdmission.mockImplementation(() => {
      const err = new Error("engine unavailable");
      err.code = "worker_unavailable";
      throw err;
    });

    const { proxyAwareFetch } = await import("../../open-sse/utils/proxyFetch.js");
    try {
      await expect(proxyAwareFetch("https://provider.test/api", {
        method: "POST",
        body: "{}",
      }, { providerId: "test", connectionId: "c-1" })).rejects.toThrow(/engine unavailable|worker_unavailable/);
    } finally {
      delete process.env.HAI_GO_ENGINE_INTEGRATION;
    }
  });
});
