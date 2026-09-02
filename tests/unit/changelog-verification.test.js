/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { VERIFICATION_GATES } from "../../src/shared/data/changelog.js";
import {
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_VARIANT,
} from "../../src/shared/data/verificationStatuses.js";
import {
  assertOfflineVerificationSource,
  formatVerificationVerifiedAt,
  getVerificationGateLabel,
  sortVerificationGates,
} from "../../src/shared/data/changelogUtils.js";

const EXPECTED_KEYS = [
  "provider_node_egress",
  "go_unit_tests",
  "go_race",
  "go_vet",
  "vitest_focused",
  "production_build",
  "docker_build",
  "cli_npm_pack",
  "provider_truthful_streaming",
];

describe("verification canonical data", () => {
  it("loads nine seeded gates with required schema", () => {
    assertOfflineVerificationSource();
    expect(VERIFICATION_GATES).toHaveLength(9);
    expect(VERIFICATION_GATES.map((g) => g.key)).toEqual(EXPECTED_KEYS);
    for (const gate of VERIFICATION_GATES) {
      expect(gate).toMatchObject({
        key: expect.any(String),
        gate: expect.any(String),
        command: expect.any(String),
        status: expect.stringMatching(/^(pass|fail|partial|not_run)$/),
      });
    }
  });

  it("seeds exact gate labels and commands from spec", () => {
    const egress = VERIFICATION_GATES.find((g) => g.key === "provider_node_egress");
    expect(egress).toMatchObject({
      gate: "Provider-facing Node egress",
      status: "pass",
      command: "npm run audit:egress",
      verifiedAt: "2026-09-02",
      notes: "0 provider-facing Node egress",
    });

    const race = VERIFICATION_GATES.find((g) => g.key === "go_race");
    expect(race).toMatchObject({
      gate: "Go race detector",
      status: "pass",
      command: "cd go-engine && go test -race ./...",
      verifiedAt: "2026-09-02",
    });
  });

  it("maps status badges to semantic variants", () => {
    expect(VERIFICATION_STATUS_VARIANT.pass).toBe("success");
    expect(VERIFICATION_STATUS_VARIANT.fail).toBe("error");
    expect(VERIFICATION_STATUS_VARIANT.partial).toBe("warning");
    expect(VERIFICATION_STATUS_VARIANT.not_run).toBe("default");
    expect(getVerificationGateLabel({ status: VERIFICATION_STATUS.PASS })).toBe("PASS");
    expect(getVerificationGateLabel({ status: VERIFICATION_STATUS.NOT_RUN })).toBe("NOT RUN");
  });

  it("formats verified date or em dash — never invents dates", () => {
    expect(formatVerificationVerifiedAt("2026-09-02")).toBe("2026-09-02");
    expect(formatVerificationVerifiedAt(null)).toBe("—");
    expect(formatVerificationVerifiedAt("")).toBe("—");
  });

  it("sorts gates PASS → PARTIAL → FAIL → NOT RUN", () => {
    const sorted = sortVerificationGates(VERIFICATION_GATES);
    const statuses = sorted.map((g) => g.status);
    const passIdx = statuses.lastIndexOf("pass");
    const failIdx = statuses.indexOf("fail");
    const notRunIdx = statuses.indexOf("not_run");
    expect(passIdx).toBeGreaterThanOrEqual(0);
    if (failIdx >= 0) expect(failIdx).toBeGreaterThan(passIdx);
    if (notRunIdx >= 0 && failIdx >= 0) expect(notRunIdx).toBeGreaterThan(failIdx);
    expect(statuses.filter((s) => s === "pass")).toHaveLength(9);
    expect(statuses.filter((s) => s === "fail")).toHaveLength(0);
    expect(statuses.filter((s) => s === "not_run")).toHaveLength(0);
  });

  it("does not require remote fetch", () => {
    expect(Array.isArray(VERIFICATION_GATES)).toBe(true);
    expect(VERIFICATION_STATUS_LABELS.pass).toBe("PASS");
  });
});

describe("verification UI module", () => {
  it("VerificationSection uses canonical data helpers", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve("src/app/(dashboard)/dashboard/changelog/VerificationSection.js"),
      "utf8",
    );
    expect(source).toContain("sortVerificationGates");
    expect(source).toContain("formatVerificationVerifiedAt");
    expect(source).not.toMatch(/fetch\s*\(/);
  });

  it("ChangelogClient exposes Verification tab", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve("src/app/(dashboard)/dashboard/changelog/ChangelogClient.js"),
      "utf8",
    );
    expect(source).toContain('id: "verification"');
    expect(source).toContain("<VerificationSection />");
  });
});
