import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";

const root = join(fileURLToPath(new URL("../..", import.meta.url)));
const script = join(root, "scripts", "audit-forbidden-egress.mjs");

describe("forbidden egress audit", () => {
  it("reports zero provider bypass in open-sse and oauth", () => {
    const res = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    if (res.status !== 0) {
      expect.fail((res.stderr || res.stdout || "audit failed").trim());
    }
    expect(res.stdout).toContain("PASS: 0 provider-facing Node egress");
  });
});
