import { describe, it, expect } from "vitest";
import {
  getEngineStateSemantic,
  getEngineHealthSemantic,
  getEngineEventSemantic,
  getActiveCountSemantic,
  getLogLevelSemantic,
  getRequestStatusSemantic,
  SEMANTIC_VARIANTS,
} from "@/shared/utils/statusSemantic";

describe("statusSemantic", () => {
  it("maps engine states", () => {
    expect(getEngineStateSemantic("RUNNING")).toBe(SEMANTIC_VARIANTS.SUCCESS);
    expect(getEngineStateSemantic("HEALTHY")).toBe(SEMANTIC_VARIANTS.SUCCESS);
    expect(getEngineStateSemantic("STARTING")).toBe(SEMANTIC_VARIANTS.INFO);
    expect(getEngineStateSemantic("RESTARTING")).toBe(SEMANTIC_VARIANTS.INFO);
    expect(getEngineStateSemantic("DEGRADED")).toBe(SEMANTIC_VARIANTS.WARNING);
    expect(getEngineStateSemantic("PAUSED")).toBe(SEMANTIC_VARIANTS.NEUTRAL);
    expect(getEngineStateSemantic("STOPPED")).toBe(SEMANTIC_VARIANTS.NEUTRAL);
    expect(getEngineStateSemantic("FAILED")).toBe(SEMANTIC_VARIANTS.ERROR);
    expect(getEngineStateSemantic("UNHEALTHY")).toBe(SEMANTIC_VARIANTS.ERROR);
    expect(getEngineStateSemantic("VERSION_MISMATCH")).toBe(SEMANTIC_VARIANTS.ERROR);
  });

  it("maps engine health labels", () => {
    expect(getEngineHealthSemantic("Healthy")).toBe(SEMANTIC_VARIANTS.SUCCESS);
    expect(getEngineHealthSemantic("Degraded")).toBe(SEMANTIC_VARIANTS.WARNING);
    expect(getEngineHealthSemantic("Paused")).toBe(SEMANTIC_VARIANTS.NEUTRAL);
    expect(getEngineHealthSemantic("Starting")).toBe(SEMANTIC_VARIANTS.INFO);
    expect(getEngineHealthSemantic("Unhealthy")).toBe(SEMANTIC_VARIANTS.ERROR);
  });

  it("maps active request counts without inferring overload", () => {
    expect(getActiveCountSemantic(0)).toBe(SEMANTIC_VARIANTS.NEUTRAL);
    expect(getActiveCountSemantic(3)).toBe(SEMANTIC_VARIANTS.INFO);
    expect(getActiveCountSemantic(99, { overloaded: true })).toBe(SEMANTIC_VARIANTS.WARNING);
  });

  it("maps engine events by name and explicit level", () => {
    expect(getEngineEventSemantic("engine_running")).toBe(SEMANTIC_VARIANTS.SUCCESS);
    expect(getEngineEventSemantic("start_requested")).toBe(SEMANTIC_VARIANTS.INFO);
    expect(getEngineEventSemantic("worker_crashed")).toBe(SEMANTIC_VARIANTS.ERROR);
    expect(getEngineEventSemantic("paused")).toBe(SEMANTIC_VARIANTS.WARNING);
    expect(getEngineEventSemantic("custom", "error")).toBe(SEMANTIC_VARIANTS.ERROR);
  });

  it("maps log levels", () => {
    expect(getLogLevelSemantic("DEBUG")).toBe(SEMANTIC_VARIANTS.NEUTRAL);
    expect(getLogLevelSemantic("INFO")).toBe(SEMANTIC_VARIANTS.INFO);
    expect(getLogLevelSemantic("WARN")).toBe(SEMANTIC_VARIANTS.WARNING);
    expect(getLogLevelSemantic("ERROR")).toBe(SEMANTIC_VARIANTS.ERROR);
  });

  it("maps request status semantics", () => {
    expect(getRequestStatusSemantic({ status: "success" })).toBe(SEMANTIC_VARIANTS.SUCCESS);
    expect(getRequestStatusSemantic({ status: "streaming" })).toBe(SEMANTIC_VARIANTS.INFO);
    expect(getRequestStatusSemantic({ status: "error" })).toBe(SEMANTIC_VARIANTS.ERROR);
    expect(getRequestStatusSemantic({ terminationReason: "client_cancelled" })).toBe(SEMANTIC_VARIANTS.NEUTRAL);
    expect(getRequestStatusSemantic({ status: "partial" })).toBe(SEMANTIC_VARIANTS.WARNING);
  });

  it("getRequestStatusTextClass uses readable error/success classes", async () => {
    const { getRequestStatusTextClass } = await import("@/shared/utils/requestDetailMetrics");
    expect(getRequestStatusTextClass({ status: "error" })).toContain("text-red");
    expect(getRequestStatusTextClass({ status: "success" })).toContain("text-green");
  });
});
