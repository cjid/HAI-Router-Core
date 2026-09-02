/** Canonical verification gate status enum (SSOT). */
export const VERIFICATION_STATUS = Object.freeze({
  PASS: "pass",
  FAIL: "fail",
  PARTIAL: "partial",
  NOT_RUN: "not_run",
});

export const VERIFICATION_STATUS_LABELS = Object.freeze({
  [VERIFICATION_STATUS.PASS]: "PASS",
  [VERIFICATION_STATUS.FAIL]: "FAIL",
  [VERIFICATION_STATUS.PARTIAL]: "PARTIAL",
  [VERIFICATION_STATUS.NOT_RUN]: "NOT RUN",
});

/** Badge variant for shared Badge component. */
export const VERIFICATION_STATUS_VARIANT = Object.freeze({
  [VERIFICATION_STATUS.PASS]: "success",
  [VERIFICATION_STATUS.FAIL]: "error",
  [VERIFICATION_STATUS.PARTIAL]: "warning",
  [VERIFICATION_STATUS.NOT_RUN]: "default",
});

/** Default display sort: PASS → PARTIAL → FAIL → NOT RUN */
export const VERIFICATION_STATUS_SORT_ORDER = Object.freeze([
  VERIFICATION_STATUS.PASS,
  VERIFICATION_STATUS.PARTIAL,
  VERIFICATION_STATUS.FAIL,
  VERIFICATION_STATUS.NOT_RUN,
]);
