"use client";

import { useMemo, useState } from "react";
import { Badge, Card, MdiIcon, Select } from "@/shared/components";
import {
  CHANGELOG_CATEGORIES,
  CHANGELOG_STATUS_LABELS,
  CHANGELOG_STATUS_VARIANT,
} from "@/shared/data/changelogStatuses.js";
import {
  CHANGELOG_ENTRIES,
  CURRENT_RELEASE,
  RELEASE_MILESTONES,
} from "@/shared/data/changelog.js";
import {
  computeStatusSummary,
  filterChangelogEntries,
  getCurrentReleaseMeta,
  groupEntriesByArea,
  resolveReleaseSections,
} from "@/shared/data/changelogUtils.js";
import VerificationSection from "./VerificationSection";
const TABS = [
  { id: "release", label: "Current Release", icon: "new_releases" },
  { id: "capabilities", label: "Capabilities", icon: "fact_check" },
  { id: "verification", label: "Verification", icon: "verified" },
  { id: "pending", label: "Known & Pending", icon: "pending_actions" },
  { id: "history", label: "History", icon: "history" },
];

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "All Categories" },
  ...CHANGELOG_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In Progress" },
  { value: "pending", label: "Pending" },
  { value: "needs_verification", label: "Needs Verification" },
  { value: "known_issue", label: "Known Issues" },
  { value: "deprecated", label: "Deprecated" },
];

function StatusBadge({ status }) {
  return (
    <Badge variant={CHANGELOG_STATUS_VARIANT[status] || "default"} size="sm">
      {CHANGELOG_STATUS_LABELS[status] || status}
    </Badge>
  );
}

function SummaryCard({ label, value, icon, variant = "default" }) {
  return (
    <Card padding="md" className="flex items-center gap-3">
      <div
        className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
          variant === "success"
            ? "bg-green-500/10 text-green-600 dark:text-green-400"
            : variant === "info"
              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              : variant === "warning"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : variant === "error"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-surface-2 text-text-muted"
        }`}
      >
        <MdiIcon name={icon} size={20} />
      </div>
      <div>
        <div className="text-2xl font-bold text-text-main leading-none">{value}</div>
        <div className="text-xs text-text-muted mt-1">{label}</div>
      </div>
    </Card>
  );
}

function EntryRow({ entry, showArea = false }) {
  return (
    <div className="py-3 border-b border-border-subtle last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-text-main">{entry.title}</h4>
            <StatusBadge status={entry.status} />
          </div>
          {showArea ? (
            <p className="text-[11px] text-text-muted mt-0.5">{entry.area}</p>
          ) : null}
          <p className="text-xs text-text-muted mt-1">{entry.summary}</p>
          {entry.notes ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{entry.notes}</p>
          ) : null}
          {entry.evidence ? (
            <p className="text-[10px] font-mono text-text-muted/80 mt-1 truncate" title={entry.evidence}>
              {entry.evidence}
            </p>
          ) : null}
        </div>
        {entry.commitSha ? (
          <a
            href={`${CURRENT_RELEASE.repoUrl}/commit/${entry.commitSha}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-mono text-primary hover:underline shrink-0"
          >
            {entry.commitSha.slice(0, 7)}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ReleaseSection({ title, entries }) {
  if (!entries?.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-text-main mb-2">{title}</h3>
      <div className="rounded-xl border border-border-subtle bg-surface px-4">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

export default function ChangelogClient() {
  const [tab, setTab] = useState("release");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const release = useMemo(() => getCurrentReleaseMeta(), []);
  const summary = useMemo(() => computeStatusSummary(CHANGELOG_ENTRIES), []);
  const releaseSections = useMemo(() => resolveReleaseSections(), []);

  const filteredEntries = useMemo(
    () => filterChangelogEntries(CHANGELOG_ENTRIES, { search, statusFilter, categoryFilter }),
    [search, statusFilter, categoryFilter],
  );

  const pendingEntries = useMemo(
    () =>
      CHANGELOG_ENTRIES.filter((e) =>
        ["pending", "needs_verification", "known_issue", "in_progress"].includes(e.status),
      ),
    [],
  );

  const groupedCapabilities = useMemo(
    () => groupEntriesByArea(filteredEntries),
    [filteredEntries],
  );

  const updatedLabel = release.updatedAt || null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Changelog</h1>
        <p className="text-sm text-text-muted mt-1">
          HAI-Router development history, capabilities, fixes, and remaining work.
        </p>
      </div>

      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-text-main">
                HAI-Router {release.version}
              </h2>
              <Badge variant="info" size="sm">Development</Badge>
              <Badge variant="primary" size="sm">Current</Badge>
            </div>
            <p className="text-xs text-text-muted mt-1">{release.architecture}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-text-muted font-mono">
              {release.buildSha ? <span>Build {release.buildSha.slice(0, 7)}</span> : null}
              {updatedLabel ? <span>Updated {updatedLabel}</span> : null}
            </div>
          </div>
          <a
            href={release.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Repository
            <MdiIcon name="open_in_new" size={14} />
          </a>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Completed" value={summary.completed} icon="check_circle" variant="success" />
        <SummaryCard label="In Progress" value={summary.inProgress} icon="progress_activity" variant="info" />
        <SummaryCard label="Pending" value={summary.pending} icon="schedule" variant="warning" />
        <SummaryCard label="Known Issues" value={summary.knownIssues} icon="error" variant="error" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="relative min-w-0">
          <MdiIcon
            name="search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search features, areas, evidence…"
            className="h-9 w-full rounded-lg border border-black/10 bg-surface pl-9 pr-3 text-sm text-text-main transition-colors placeholder:text-text-muted hover:border-primary/30 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-white/10"
            aria-label="Search changelog"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0 sm:items-center">
          <Select
            size="sm"
            fullWidth
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={STATUS_FILTER_OPTIONS}
            searchable={false}
            aria-label="Filter by status"
            className="w-full sm:w-[9.5rem] shrink-0"
          />
          <Select
            size="sm"
            fullWidth
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={CATEGORY_FILTER_OPTIONS}
            searchable={false}
            aria-label="Filter by category"
            className="w-full sm:w-[11.5rem] shrink-0"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border-subtle pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-primary text-white"
                : "text-text-muted hover:bg-surface-2 hover:text-text-main"
            }`}
          >
            <MdiIcon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "release" && (
        <div className="space-y-5">
          <ReleaseSection title="Highlights" entries={releaseSections.highlights} />
          <ReleaseSection title="Features" entries={releaseSections.features} />
          <ReleaseSection title="Improvements" entries={releaseSections.improvements} />
          <ReleaseSection title="Performance" entries={releaseSections.performance} />
          <ReleaseSection title="Fixes" entries={releaseSections.fixes} />
          <ReleaseSection title="Security / Safety" entries={releaseSections.security} />
          <ReleaseSection title="Compatibility" entries={releaseSections.compatibility} />
          <ReleaseSection title="Deprecated / Removed" entries={releaseSections.deprecated} />
        </div>
      )}

      {tab === "verification" && <VerificationSection />}

      {tab === "capabilities" && (
        <div className="space-y-4">
          {groupedCapabilities.length === 0 ? (
            <p className="text-sm text-text-muted py-6 text-center">No capabilities match your filters.</p>
          ) : (
            groupedCapabilities.map(([area, entries]) => (
              <Card key={area} padding="md">
                <h3 className="text-sm font-semibold text-text-main mb-2">{area}</h3>
                {entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "pending" && (
        <div className="space-y-5">
          {["Known Issues", "Needs Verification / Pending", "In Progress"].map((sectionTitle) => {
            const subset = pendingEntries.filter((e) => {
              if (sectionTitle.startsWith("Known")) return e.status === "known_issue";
              if (sectionTitle.startsWith("Needs")) {
                return e.status === "pending" || e.status === "needs_verification";
              }
              return e.status === "in_progress";
            });
            return (
              <div key={sectionTitle}>
                <h3 className="text-sm font-semibold text-text-main mb-2">{sectionTitle}</h3>
                {subset.length === 0 ? (
                  <p className="text-xs text-text-muted py-3">
                    No {sectionTitle.toLowerCase()} recorded for this category.
                  </p>
                ) : (
                  <Card padding="md">
                    {subset.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} showArea />
                    ))}
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            HAI-Router development milestones — bundled locally, no remote fetch.
          </p>
          {RELEASE_MILESTONES.map((m) => (
            <Card key={m.id} padding="md">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-text-main">{m.title}</h3>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="text-xs text-text-muted mt-1">{m.summary}</p>
                  <p className="text-[11px] text-text-muted mt-1">{m.date}</p>
                </div>
                {m.commitSha ? (
                  <a
                    href={`${CURRENT_RELEASE.repoUrl}/commit/${m.commitSha}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-mono text-primary hover:underline"
                  >
                    {m.commitSha.slice(0, 7)}
                  </a>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
