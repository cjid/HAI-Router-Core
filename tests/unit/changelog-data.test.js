/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHANGELOG_ENTRIES,
  CURRENT_RELEASE,
  RELEASE_MILESTONES,
  VERIFICATION_GATES,
  CHANGELOG_STATUS,
} from "../../src/shared/data/changelog.js";
import {
  assertOfflineChangelogSource,
  assertNoLegacyProductBrandingInChangelog,
  computeStatusSummary,
  filterChangelogEntries,
  getCurrentReleaseMeta,
  getCurrentVersion,
  getLegacyAttributionOnly,
  resolveReleaseSections,
} from "../../src/shared/data/changelogUtils.js";
import { GITHUB_CONFIG } from "../../src/shared/constants/config.js";
import { getAppVersion } from "../../src/shared/constants/product.js";

describe("changelog canonical data", () => {
  it("loads bundled entries without remote dependency", () => {
    expect(assertOfflineChangelogSource()).toBe(true);
    expect(CHANGELOG_ENTRIES.length).toBeGreaterThan(30);
    expect(CURRENT_RELEASE.buildSha).toBeTruthy();
    expect(RELEASE_MILESTONES.length).toBeGreaterThan(5);
    expect(VERIFICATION_GATES).toHaveLength(9);
  });

  it("does not expose remote changelogUrl in GITHUB_CONFIG", () => {
    expect(GITHUB_CONFIG.changelogUrl).toBeUndefined();
    expect(GITHUB_CONFIG.repoUrl).toContain("HAI-Router-Core");
  });

  it("uses HAI-Router version SSOT — not legacy upstream 9Router 0.5.59", () => {
    expect(getCurrentVersion()).toBe("0.1.0-init");
    expect(getCurrentReleaseMeta().version).toBe("0.1.0-init");
    expect(getCurrentVersion()).toBe(getAppVersion());
    expect(getLegacyAttributionOnly().upstreamVersion).toBe("0.5.59");
  });

  it("computes summary counts from entries — not hardcoded", () => {
    const summary = computeStatusSummary(CHANGELOG_ENTRIES);
    const manual = {
      completed: CHANGELOG_ENTRIES.filter((e) => e.status === CHANGELOG_STATUS.COMPLETED).length,
      inProgress: CHANGELOG_ENTRIES.filter((e) => e.status === CHANGELOG_STATUS.IN_PROGRESS).length,
      pending: CHANGELOG_ENTRIES.filter((e) =>
        e.status === CHANGELOG_STATUS.PENDING || e.status === CHANGELOG_STATUS.NEEDS_VERIFICATION,
      ).length,
      knownIssues: CHANGELOG_ENTRIES.filter((e) => e.status === CHANGELOG_STATUS.KNOWN_ISSUE).length,
    };
    expect(summary).toEqual(manual);
    expect(summary.completed).toBeGreaterThan(0);
  });

  it("resolves release sections to entry objects", () => {
    const sections = resolveReleaseSections();
    expect(sections.highlights.length).toBeGreaterThan(0);
    expect(sections.highlights[0]).toHaveProperty("title");
    expect(sections.deprecated.some((e) => e.id === "stream-presentation-smoother")).toBe(true);
  });

  it("filters by search and status", () => {
    const goEntries = filterChangelogEntries(CHANGELOG_ENTRIES, {
      search: "go engine",
      statusFilter: "all",
    });
    expect(goEntries.some((e) => e.id === "go-canonical-transport")).toBe(true);

    const pending = filterChangelogEntries(CHANGELOG_ENTRIES, { statusFilter: "pending" });
    expect(pending.every((e) => e.status === CHANGELOG_STATUS.PENDING)).toBe(true);
  });

  it("does not list inherited 9Router releases as current HAI-Router milestones", () => {
    const blob = JSON.stringify(RELEASE_MILESTONES);
    expect(blob).not.toMatch(/0\.5\.\d+/);
    expect(RELEASE_MILESTONES.every((m) => m.title && m.date)).toBe(true);
  });

  it("does not expose legacy 9Router branding in changelog UI copy", () => {
    expect(assertNoLegacyProductBrandingInChangelog()).toBe(true);
    const blob = JSON.stringify([...CHANGELOG_ENTRIES, ...RELEASE_MILESTONES, ...VERIFICATION_GATES]);
    expect(blob).not.toMatch(/\b9router\b/i);
    expect(blob).not.toMatch(/~\/\.9router/i);
  });

  it("marks legacy upstream version as attribution-only (not shown in changelog entries)", () => {
    const legacy = getLegacyAttributionOnly();
    expect(legacy.upstreamVersion).toBe("0.5.59");
    expect(legacy.note).toMatch(/attribution/i);
  });

  it("survives global fetch failure — no runtime GitHub dependency", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(() => assertOfflineChangelogSource()).not.toThrow();
    expect(getCurrentReleaseMeta().version).toBe(getAppVersion());
    vi.unstubAllGlobals();
  });
});

describe("changelog removed remote modal", () => {
  it("ChangelogModal.js is removed", () => {
    let threw = false;
    try {
      readFileSync(resolve("src/shared/components/ChangelogModal.js"));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("HeaderMenu navigates to /dashboard/changelog", () => {
    const source = readFileSync(resolve("src/shared/components/HeaderMenu.js"), "utf8");
    expect(source).toContain('router.push("/dashboard/changelog")');
    expect(source).not.toContain("ChangelogModal");
  });
});
