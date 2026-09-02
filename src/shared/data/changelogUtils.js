import { getAppVersion } from "@/shared/constants/product.js";
import {
  CHANGELOG_ENTRIES,
  CURRENT_RELEASE,
  RELEASE_MILESTONES,
  VERIFICATION_GATES,
  CHANGELOG_STATUS,
  VERIFICATION_STATUS,
  getChangelogEntryMap,
} from "./changelog.js";
import { CHANGELOG_STATUS_LABELS } from "./changelogStatuses.js";
import {
  VERIFICATION_STATUS_SORT_ORDER,
  VERIFICATION_STATUS_LABELS,
} from "./verificationStatuses.js";

export { CHANGELOG_ENTRIES, CURRENT_RELEASE, RELEASE_MILESTONES, VERIFICATION_GATES, CHANGELOG_STATUS };
export {
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_VARIANT,
} from "./verificationStatuses.js";

const SUMMARY_BUCKETS = Object.freeze({
  completed: [CHANGELOG_STATUS.COMPLETED],
  inProgress: [CHANGELOG_STATUS.IN_PROGRESS],
  pending: [CHANGELOG_STATUS.PENDING, CHANGELOG_STATUS.NEEDS_VERIFICATION],
  knownIssues: [CHANGELOG_STATUS.KNOWN_ISSUE],
});

export function getCurrentVersion() {
  return getAppVersion();
}

export function getCurrentReleaseMeta() {
  return {
    ...CURRENT_RELEASE,
    version: getCurrentVersion(),
    productName: "HAI-Router",
  };
}

export function computeStatusSummary(entries = CHANGELOG_ENTRIES) {
  const counts = {
    completed: 0,
    inProgress: 0,
    pending: 0,
    knownIssues: 0,
  };

  for (const entry of entries) {
    if (SUMMARY_BUCKETS.completed.includes(entry.status)) counts.completed += 1;
    else if (SUMMARY_BUCKETS.inProgress.includes(entry.status)) counts.inProgress += 1;
    else if (SUMMARY_BUCKETS.pending.includes(entry.status)) counts.pending += 1;
    else if (SUMMARY_BUCKETS.knownIssues.includes(entry.status)) counts.knownIssues += 1;
  }

  return counts;
}

export function resolveReleaseSections(sections = CURRENT_RELEASE.sections) {
  const map = getChangelogEntryMap();
  const resolved = {};
  for (const [key, ids] of Object.entries(sections)) {
    resolved[key] = ids.map((id) => map[id]).filter(Boolean);
  }
  return resolved;
}

const STATUS_FILTER_MAP = Object.freeze({
  all: null,
  completed: CHANGELOG_STATUS.COMPLETED,
  in_progress: CHANGELOG_STATUS.IN_PROGRESS,
  pending: CHANGELOG_STATUS.PENDING,
  needs_verification: CHANGELOG_STATUS.NEEDS_VERIFICATION,
  known_issue: CHANGELOG_STATUS.KNOWN_ISSUE,
  deprecated: CHANGELOG_STATUS.DEPRECATED,
});

export function filterChangelogEntries(
  entries,
  { search = "", statusFilter = "all", categoryFilter = "all" } = {},
) {
  const q = search.trim().toLowerCase();
  const statusTarget = STATUS_FILTER_MAP[statusFilter] ?? null;

  return entries.filter((entry) => {
    if (statusTarget && entry.status !== statusTarget) return false;
    if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
    if (!q) return true;
    const haystack = [
      entry.title,
      entry.summary,
      entry.area,
      entry.evidence,
      entry.notes,
      CHANGELOG_STATUS_LABELS[entry.status],
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function groupEntriesByArea(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const area = entry.area || "Other";
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(entry);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function getLegacyAttributionOnly() {
  return {
    upstreamName: "9Router",
    upstreamVersion: "0.5.59",
    note: "Shown for attribution only — not current HAI-Router release history.",
  };
}

/** Block legacy upstream product names from user-visible changelog copy. */
const LEGACY_PRODUCT_BRANDING = /\b9\s*router\b|~\/\.9router/i;

export function assertNoLegacyProductBrandingInChangelog() {
  const fields = (item) => [item.title, item.summary, item.area, item.gate, item.notes].filter(Boolean);
  for (const entry of CHANGELOG_ENTRIES) {
    for (const text of fields(entry)) {
      if (LEGACY_PRODUCT_BRANDING.test(String(text))) {
        throw new Error(`Legacy product branding in changelog entry ${entry.id}: ${text}`);
      }
    }
  }
  for (const milestone of RELEASE_MILESTONES) {
    for (const text of fields(milestone)) {
      if (LEGACY_PRODUCT_BRANDING.test(String(text))) {
        throw new Error(`Legacy product branding in milestone ${milestone.id}: ${text}`);
      }
    }
  }
  for (const gate of VERIFICATION_GATES) {
    for (const text of fields(gate)) {
      if (LEGACY_PRODUCT_BRANDING.test(String(text))) {
        throw new Error(`Legacy product branding in verification gate ${gate.key}: ${text}`);
      }
    }
  }
  return true;
}

/** Ensure no remote fetch is required — regression guard for tests. */
export function assertOfflineChangelogSource() {
  if (!Array.isArray(CHANGELOG_ENTRIES) || CHANGELOG_ENTRIES.length === 0) {
    throw new Error("Changelog entries missing");
  }
  if (!CURRENT_RELEASE?.sections) {
    throw new Error("Current release metadata missing");
  }
  assertOfflineVerificationSource();
  assertNoLegacyProductBrandingInChangelog();
  return true;
}

/** Format verifiedAt for display — never invent dates. */
export function formatVerificationVerifiedAt(verifiedAt) {
  if (verifiedAt == null || verifiedAt === "") return "—";
  return String(verifiedAt);
}

/** Sort gates: PASS → PARTIAL → FAIL → NOT RUN, stable within same status. */
export function sortVerificationGates(gates = VERIFICATION_GATES) {
  const order = new Map(VERIFICATION_STATUS_SORT_ORDER.map((s, i) => [s, i]));
  return [...gates].sort((a, b) => {
    const ai = order.get(a.status) ?? 99;
    const bi = order.get(b.status) ?? 99;
    if (ai !== bi) return ai - bi;
    return String(a.gate).localeCompare(String(b.gate));
  });
}

/** Validate verification status enum. */
export function isValidVerificationStatus(status) {
  return Object.values(VERIFICATION_STATUS).includes(status);
}

export function getVerificationGateLabel(gate) {
  return VERIFICATION_STATUS_LABELS[gate.status] || String(gate.status || "").toUpperCase();
}

/** Ensure verification gates are locally bundled and schema-valid. */
export function assertOfflineVerificationSource() {
  if (!Array.isArray(VERIFICATION_GATES) || VERIFICATION_GATES.length === 0) {
    throw new Error("Verification gates missing");
  }
  for (const gate of VERIFICATION_GATES) {
    if (!gate.key || !gate.gate || !gate.command) {
      throw new Error(`Invalid verification gate: ${gate.key || "unknown"}`);
    }
    if (!isValidVerificationStatus(gate.status)) {
      throw new Error(`Invalid verification status for ${gate.key}: ${gate.status}`);
    }
  }
  return true;
}
