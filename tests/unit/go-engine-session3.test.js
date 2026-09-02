import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dirname, "..", "..");

function readSource(relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

describe("goEngine Session 3 special provider paths", () => {
  it("cursor fetch path uses proxyAwareFetch (Go-eligible)", () => {
    const src = readSource("open-sse/executors/cursor.js");
    expect(src).toContain("proxyAwareFetch");
    expect(src).toMatch(/makeFetchRequest[\s\S]*proxyAwareFetch/);
  });

  it("kiro executor inherits BaseExecutor proxyAwareFetch path", () => {
    const src = readSource("open-sse/executors/kiro.js");
    expect(src).toContain("extends BaseExecutor");
    const base = readSource("open-sse/executors/base.js");
    expect(base).toContain("proxyAwareFetch");
  });

  it("codex/default refresh paths use proxyAwareFetch", () => {
    const src = readSource("open-sse/executors/default.js");
    expect(src).toContain("proxyAwareFetch");
  });

  it("cursor HTTP/2 path uses Go transport when engine enabled", () => {
    const src = readSource("open-sse/executors/cursor.js");
    expect(src).toContain("makeHttp2Request");
    expect(src).toMatch(/makeHttp2Request[\s\S]*goEngineFetch/);
    expect(src).toContain("goEngineOpenHttp2Stream");
    expect(src).toContain("connectHttp2Client");
  });
});

describe("goEngine worker manager affinity export", () => {
  it("computeWorkerIndex is exported for regression tests", async () => {
    const mod = await import("@/lib/goEngine/workerManager.js");
    expect(typeof mod.computeWorkerIndex).toBe("function");
  });
});
