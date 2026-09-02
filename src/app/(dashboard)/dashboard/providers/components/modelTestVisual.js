import { cn } from "@/shared/utils/cn";

export const MODEL_TEST_VISUAL_STATE = {
  IDLE: "idle",
  TESTING: "testing",
  SUCCESS: "success",
  ERROR: "error",
};

export const MODEL_ROW_ACTION_BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-text-muted transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-50";

const ACTION_BTN = MODEL_ROW_ACTION_BTN;

export function resolveModelTestVisualState({ isTesting, testStatus }) {
  if (isTesting) return MODEL_TEST_VISUAL_STATE.TESTING;
  if (testStatus === "ok") return MODEL_TEST_VISUAL_STATE.SUCCESS;
  if (testStatus === "error") return MODEL_TEST_VISUAL_STATE.ERROR;
  return MODEL_TEST_VISUAL_STATE.IDLE;
}

/** Full-row border/glow feedback (inset box-shadow avoids layout shift). */
export function getModelTestRowClass({ isTesting, testStatus }) {
  const state = resolveModelTestVisualState({ isTesting, testStatus });
  switch (state) {
    case MODEL_TEST_VISUAL_STATE.TESTING:
      return "model-test-row-testing";
    case MODEL_TEST_VISUAL_STATE.SUCCESS:
      return "model-test-row-success";
    case MODEL_TEST_VISUAL_STATE.ERROR:
      return "model-test-row-error";
    default:
      return "model-test-row-idle";
  }
}

/**
 * Legacy per-cell hook — row-level border is canonical; cells stay background-neutral.
 * @deprecated Row uses getModelTestRowClass; cells no longer need test overlays.
 */
export function getModelTestCellClass() {
  return null;
}

export function getModelTestButtonClass({ isTesting, testStatus }) {
  if (isTesting) {
    return cn(
      ACTION_BTN,
      "cursor-wait border-primary/50 text-primary hover:bg-surface-2 hover:text-primary",
    );
  }
  if (testStatus === "ok") {
    return cn(
      ACTION_BTN,
      "cursor-not-allowed border-emerald-500/50 text-emerald-500 hover:bg-surface-2 hover:text-emerald-500",
    );
  }
  if (testStatus === "error") {
    return cn(
      ACTION_BTN,
      "cursor-not-allowed border-red-500/50 text-red-500 hover:bg-surface-2 hover:text-red-500",
    );
  }
  return ACTION_BTN;
}

export const MODEL_TEST_SUCCESS_FEEDBACK_MS = 2000;
export const MODEL_TEST_ERROR_FEEDBACK_MS = 2500;

export function modelTestFeedbackMs(result) {
  return result === "ok" ? MODEL_TEST_SUCCESS_FEEDBACK_MS : MODEL_TEST_ERROR_FEEDBACK_MS;
}

export function getModelTestTooltip({ isTesting, testStatus }) {
  if (isTesting) return "Test in progress";
  if (testStatus === "ok") return "Model test succeeded";
  if (testStatus === "error") return "Model test failed";
  return "Test model";
}
