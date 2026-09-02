/** Canonical changelog / capability status taxonomy (SSOT). */
export const CHANGELOG_STATUS = Object.freeze({
  COMPLETED: "completed",
  IN_PROGRESS: "in_progress",
  PENDING: "pending",
  NEEDS_VERIFICATION: "needs_verification",
  KNOWN_ISSUE: "known_issue",
  DEPRECATED: "deprecated",
});

export const CHANGELOG_STATUS_LABELS = Object.freeze({
  [CHANGELOG_STATUS.COMPLETED]: "Completed",
  [CHANGELOG_STATUS.IN_PROGRESS]: "In Progress",
  [CHANGELOG_STATUS.PENDING]: "Pending",
  [CHANGELOG_STATUS.NEEDS_VERIFICATION]: "Needs Verification",
  [CHANGELOG_STATUS.KNOWN_ISSUE]: "Known Issue",
  [CHANGELOG_STATUS.DEPRECATED]: "Deprecated / Removed",
});

/** Badge variant for shared Badge component. */
export const CHANGELOG_STATUS_VARIANT = Object.freeze({
  [CHANGELOG_STATUS.COMPLETED]: "success",
  [CHANGELOG_STATUS.IN_PROGRESS]: "info",
  [CHANGELOG_STATUS.PENDING]: "warning",
  [CHANGELOG_STATUS.NEEDS_VERIFICATION]: "warning",
  [CHANGELOG_STATUS.KNOWN_ISSUE]: "error",
  [CHANGELOG_STATUS.DEPRECATED]: "default",
});

export const CHANGELOG_CATEGORIES = Object.freeze([
  { id: "core", label: "Core" },
  { id: "go-engine", label: "Go Engine" },
  { id: "provider", label: "Provider" },
  { id: "streaming", label: "Streaming" },
  { id: "usage", label: "Usage" },
  { id: "ui", label: "UI" },
  { id: "packaging", label: "Packaging" },
  { id: "identity", label: "Identity" },
  { id: "security", label: "Security" },
]);
