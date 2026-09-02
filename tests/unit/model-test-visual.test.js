import { describe, it, expect } from "vitest";
import {
  MODEL_TEST_VISUAL_STATE,
  resolveModelTestVisualState,
  getModelTestRowClass,
  getModelTestCellClass,
  getModelTestButtonClass,
  modelTestFeedbackMs,
} from "../../src/app/(dashboard)/dashboard/providers/components/modelTestVisual.js";

describe("resolveModelTestVisualState", () => {
  it("returns testing while in-flight even if stale result exists", () => {
    expect(resolveModelTestVisualState({ isTesting: true, testStatus: "ok" }))
      .toBe(MODEL_TEST_VISUAL_STATE.TESTING);
  });

  it("returns idle when no test activity", () => {
    expect(resolveModelTestVisualState({ isTesting: false, testStatus: undefined }))
      .toBe(MODEL_TEST_VISUAL_STATE.IDLE);
  });

  it("returns success and error from canonical result", () => {
    expect(resolveModelTestVisualState({ isTesting: false, testStatus: "ok" }))
      .toBe(MODEL_TEST_VISUAL_STATE.SUCCESS);
    expect(resolveModelTestVisualState({ isTesting: false, testStatus: "error" }))
      .toBe(MODEL_TEST_VISUAL_STATE.ERROR);
  });
});

describe("getModelTestRowClass", () => {
  it("uses transparent inset border in idle to avoid layout shift", () => {
    const cls = getModelTestRowClass({ isTesting: false, testStatus: undefined });
    expect(cls).toContain("model-test-row-idle");
    expect(cls).not.toMatch(/bg-/);
  });

  it("uses accent border-only classes while testing", () => {
    const cls = getModelTestRowClass({ isTesting: true, testStatus: undefined });
    expect(cls).toContain("model-test-row-testing");
    expect(cls).not.toMatch(/bg-/);
    expect(cls).not.toContain("animate-pulse");
  });

  it("uses green border-only classes on success", () => {
    const cls = getModelTestRowClass({ isTesting: false, testStatus: "ok" });
    expect(cls).toContain("model-test-row-success");
    expect(cls).not.toMatch(/bg-/);
  });

  it("uses red border-only classes on error", () => {
    const cls = getModelTestRowClass({ isTesting: false, testStatus: "error" });
    expect(cls).toContain("model-test-row-error");
    expect(cls).not.toMatch(/bg-/);
  });
});

describe("getModelTestCellClass", () => {
  it("does not apply per-cell background fills in any state", () => {
    const cases = [
      { isTesting: true },
      { testStatus: "ok" },
      { testStatus: "error" },
    ];
    for (const input of cases) {
      const cls = getModelTestCellClass(input, { isFirst: true, isLast: true }) || "";
      expect(cls).not.toMatch(/bg-/);
    }
  });
});

describe("getModelTestButtonClass", () => {
  it("keeps testing spinner styling inside button without filled background", () => {
    const cls = getModelTestButtonClass({ isTesting: true, testStatus: undefined });
    expect(cls).toContain("cursor-wait");
    expect(cls).not.toMatch(/bg-primary/);
    expect(cls).not.toMatch(/bg-emerald/);
    expect(cls).not.toMatch(/bg-red/);
  });
});

describe("modelTestFeedbackMs", () => {
  it("uses brief success and slightly longer error feedback windows", () => {
    expect(modelTestFeedbackMs("ok")).toBe(2000);
    expect(modelTestFeedbackMs("error")).toBe(2500);
  });
});

describe("multiple row independence", () => {
  it("derives independent visual states per model id inputs", () => {
    const rowA = resolveModelTestVisualState({ isTesting: true, testStatus: undefined });
    const rowB = resolveModelTestVisualState({ isTesting: false, testStatus: "ok" });
    const rowC = resolveModelTestVisualState({ isTesting: false, testStatus: undefined });

    expect(rowA).toBe(MODEL_TEST_VISUAL_STATE.TESTING);
    expect(rowB).toBe(MODEL_TEST_VISUAL_STATE.SUCCESS);
    expect(rowC).toBe(MODEL_TEST_VISUAL_STATE.IDLE);
  });
});

describe("retry transition", () => {
  it("prioritizes testing over stale error result", () => {
    expect(resolveModelTestVisualState({ isTesting: true, testStatus: "error" }))
      .toBe(MODEL_TEST_VISUAL_STATE.TESTING);
    expect(getModelTestRowClass({ isTesting: true, testStatus: "error" }))
      .toBe("model-test-row-testing");
  });
});
