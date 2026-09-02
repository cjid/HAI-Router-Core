import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";

const workerState = { baseUrl: "", authToken: "test-token" };
/** @type {import("http").IncomingMessage & { capturedSpec?: object } | null} */
let lastCapturedSpec = null;

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

describe("OAuth token exchange via Go transport", () => {
  /** @type {http.Server|null} */
  let mockWorker = null;

  beforeEach(async () => {
    lastCapturedSpec = null;
    process.env.HAI_GO_ENGINE = "1";
    process.env.HAI_GO_ENGINE_INTEGRATION = "1";

    mockWorker = http.createServer((req, res) => {
      if (req.url === "/v1/execute" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
          const spec = JSON.parse(body);
          lastCapturedSpec = spec;
          if (req.headers["x-hai-worker-token"] !== workerState.authToken) {
            res.writeHead(401);
            res.end("unauthorized");
            return;
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            "X-HAI-Transport-Protocol": "1",
          });
          res.end(JSON.stringify({
            access_token: "mock-access",
            refresh_token: "mock-refresh",
            expires_in: 3600,
            token_type: "Bearer",
          }));
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

  it("preserves Antigravity authorization_code form body", async () => {
    const antigravity = (await import("../../src/lib/oauth/providers/antigravity.js")).default;
    const config = {
      clientId: "antigravity-client",
      clientSecret: "antigravity-secret",
      tokenUrl: "https://oauth.example.com/token",
    };

    await antigravity.exchangeToken(config, "auth-code-xyz", "http://localhost:20127/oauth/callback");

    expect(lastCapturedSpec).toBeTruthy();
    expect(lastCapturedSpec.method).toBe("POST");
    expect(lastCapturedSpec.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const parsed = new URLSearchParams(lastCapturedSpec.body);
    expect(parsed.get("grant_type")).toBe("authorization_code");
    expect(parsed.get("client_id")).toBe("antigravity-client");
    expect(parsed.get("client_secret")).toBe("antigravity-secret");
    expect(parsed.get("code")).toBe("auth-code-xyz");
    expect(parsed.get("redirect_uri")).toBe("http://localhost:20127/oauth/callback");
    expect(lastCapturedSpec.body).not.toBe("{}");
  });

  it("preserves Codex PKCE form body including code_verifier", async () => {
    const codex = (await import("../../src/lib/oauth/providers/codex.js")).default;
    const config = {
      clientId: "codex-client",
      tokenUrl: "https://auth.openai.com/oauth/token",
    };

    await codex.exchangeToken(
      config,
      "pkce-code",
      "http://127.0.0.1:1455/auth/callback",
      "verifier+a/b=c?&"
    );

    const parsed = new URLSearchParams(lastCapturedSpec.body);
    expect(parsed.get("grant_type")).toBe("authorization_code");
    expect(parsed.get("client_id")).toBe("codex-client");
    expect(parsed.get("code")).toBe("pkce-code");
    expect(parsed.get("redirect_uri")).toBe("http://127.0.0.1:1455/auth/callback");
    expect(parsed.get("code_verifier")).toBe("verifier+a/b=c?&");
    expect(lastCapturedSpec.body).not.toContain("{}");
  });

  it("preserves refresh_token form body through Go transport", async () => {
    const { goEngineFetch } = await import("@/lib/goEngine/goTransport.js");

    await goEngineFetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "rt-abc",
        client_id: "gh-client",
        client_secret: "gh-secret",
      }),
    }, { providerId: "github" });

    const parsed = new URLSearchParams(lastCapturedSpec.body);
    expect(parsed.get("grant_type")).toBe("refresh_token");
    expect(parsed.get("refresh_token")).toBe("rt-abc");
  });
});
