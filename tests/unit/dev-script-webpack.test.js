/**
 * @vitest-environment node
 * Dev must use webpack — production build and open-sse/native deps are not Turbopack-safe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("dev script uses webpack bundler", () => {
  it("npm run dev invokes next dev --webpack (not Turbopack default)", () => {
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(pkg.scripts.dev).toMatch(/--webpack/);
    expect(pkg.scripts.build).toMatch(/build-production|next build --webpack/);
  });
});
