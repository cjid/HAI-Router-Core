import { describe, it, expect } from "vitest";
import {
  isProcessLoading,
  normalizeProcessState,
  resolveProcessIcon,
  resolveProcessLabel,
  resolveProcessMinWidthCh,
  PROCESS_STATE,
  PROCESS_LABEL_PRESETS,
} from "../../src/shared/constants/buttonProcess.js";

describe("buttonProcess", () => {
  it("normalizes loading boolean to loading state", () => {
    expect(normalizeProcessState(null, { loading: true })).toBe(PROCESS_STATE.LOADING);
    expect(normalizeProcessState(PROCESS_STATE.SUCCESS, { loading: true })).toBe(PROCESS_STATE.SUCCESS);
  });

  it("keeps explicit loading state when disabled prop is also true", () => {
    expect(normalizeProcessState(PROCESS_STATE.FETCHING, { disabled: true })).toBe(PROCESS_STATE.FETCHING);
    expect(normalizeProcessState(PROCESS_STATE.LOADING, { disabled: true })).toBe(PROCESS_STATE.LOADING);
  });

  it("marks verb states as loading", () => {
    expect(isProcessLoading(PROCESS_STATE.FETCHING)).toBe(true);
    expect(isProcessLoading(PROCESS_STATE.IDLE)).toBe(false);
  });

  it("resolves process icons from real state", () => {
    expect(resolveProcessIcon(PROCESS_STATE.FETCHING, "cloud_download")).toBe("progress_activity");
    expect(resolveProcessIcon(PROCESS_STATE.SUCCESS, "cloud_download")).toBe("check");
    expect(resolveProcessIcon(PROCESS_STATE.IDLE, "cloud_download")).toBe("cloud_download");
  });

  it("uses stable labels without ellipsis", () => {
    const labels = {
      idle: "Fetch Models",
      fetching: "Fetching",
      success: "Models Synced",
      error: "Fetch Models",
    };
    expect(resolveProcessLabel(PROCESS_STATE.FETCHING, { processLabels: labels })).toBe("Fetching");
    expect(resolveProcessLabel(PROCESS_STATE.ERROR, { processLabels: labels })).toBe("Fetch Models");
  });

  it("computes min width from longest label", () => {
    const ch = resolveProcessMinWidthCh({
      idle: "Fetch Models",
      fetching: "Fetching",
      success: "Models Synced",
    }, null);
    expect(ch).toBeGreaterThan(12);
  });

  it("exposes shared apply/reset presets", () => {
    expect(PROCESS_LABEL_PRESETS.apply.saving).toBe("Applying");
    expect(PROCESS_LABEL_PRESETS.reset.loading).toBe("Resetting");
  });
});
