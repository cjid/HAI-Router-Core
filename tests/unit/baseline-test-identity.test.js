import { describe, it, expect } from "vitest";
import { resolve } from "path";
import {
  normalizeTestFilePath,
  testFailureIdentity,
  compareFailureSets,
} from "../__baseline__/test-identity.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");

describe("baseline test identity normalization", () => {
  it("normalizes Linux /app/ absolute path", () => {
    const p = "/app/tests/unit/example.test.js";
    expect(normalizeTestFilePath(p, REPO)).toBe("tests/unit/example.test.js");
  });

  it("normalizes Windows absolute path", () => {
    const p = "F:\\TXA Soft International\\9RCustom\\tests\\unit\\example.test.js";
    expect(normalizeTestFilePath(p, REPO)).toBe("tests/unit/example.test.js");
  });

  it("normalizes other absolute checkout path via repoRoot", () => {
    const p = resolve(REPO, "tests/unit/example.test.js");
    expect(normalizeTestFilePath(p, REPO)).toBe("tests/unit/example.test.js");
  });

  it("keeps already-relative tests/ path", () => {
    expect(normalizeTestFilePath("tests/unit/example.test.js", REPO)).toBe("tests/unit/example.test.js");
  });

  it("builds canonical failure identity", () => {
    const id = testFailureIdentity(
      "F:\\TXA Soft International\\9RCustom\\tests\\unit\\foo.test.js",
      "suite case name",
      REPO,
    );
    expect(id).toBe("tests/unit/foo.test.js :: suite case name");
  });

  it("compareFailureSets computes new/fixed/unchanged", () => {
    const base = ["tests/a.test.js :: one", "tests/b.test.js :: two"];
    const cur = ["tests/b.test.js :: two", "tests/c.test.js :: three"];
    const { unchanged, fixed, newFailures } = compareFailureSets(base, cur);
    expect(unchanged).toEqual(["tests/b.test.js :: two"]);
    expect(fixed).toEqual(["tests/a.test.js :: one"]);
    expect(newFailures).toEqual(["tests/c.test.js :: three"]);
  });
});
