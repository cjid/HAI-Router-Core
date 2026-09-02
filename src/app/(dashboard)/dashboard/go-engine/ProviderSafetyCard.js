"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, MdiIcon, ProviderIcon, Select } from "@/shared/components";
import { PROCESS_STATE } from "@/shared/constants/buttonProcess";
import { useDateTimeFormat } from "@/shared/hooks/useDateTimeFormat";
import {
  getEngineHealthSemantic,
  getSemanticTextClass,
} from "@/shared/utils/statusSemantic";
import { useNotificationStore } from "@/store/notificationStore";
import {
  FETCH_MODE,
  applyProviderSafetyFetchResult,
  createPollScheduler,
  isDirtyState,
  shouldShowSelectLoading,
} from "./providerSafetyCardState.js";

const GENERIC_SAFETY_KEY = "generic";
const POLL_INTERVAL_MS = 3000;

function ProviderSafetyOption({ option, size = 20 }) {
  if (option.value === GENERIC_SAFETY_KEY) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted"
        style={{ width: size, height: size }}
      >
        <MdiIcon name="lan" size={Math.max(12, size - 6)} />
      </span>
    );
  }

  return (
    <ProviderIcon
      providerId={String(option.value)}
      alt={option.label}
      size={size}
      className="shrink-0 rounded-lg object-contain"
      fallbackText={option.label?.charAt(0) || "?"}
    />
  );
}

function renderProviderOption(option, { selected, focused }) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 px-2 py-1.5 ${focused ? "bg-surface-2" : ""} ${selected ? "font-medium" : ""}`}
    >
      <ProviderSafetyOption option={option} />
      <div className="min-w-0">
        <div className="truncate text-sm text-text-main">{option.label}</div>
        {option.description ? (
          <div className="truncate text-xs text-text-muted">{option.description}</div>
        ) : null}
      </div>
    </div>
  );
}

function NumericStepper({ value, min = 1, max = 64, disabled, onChange }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-subtle bg-surface text-text-main transition-colors hover:bg-surface-2 disabled:opacity-40"
        disabled={disabled || value <= min}
        aria-label="Decrease"
        onClick={dec}
      >
        <MdiIcon name="remove" size={16} />
      </button>
      <span className="inline-flex min-w-[2.5rem] justify-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-subtle bg-surface text-text-main transition-colors hover:bg-surface-2 disabled:opacity-40"
        disabled={disabled || value >= max}
        aria-label="Increase"
        onClick={inc}
      >
        <MdiIcon name="add" size={16} />
      </button>
    </div>
  );
}

function ProviderSafetySkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-9 w-full rounded-lg bg-black/5 dark:bg-white/5" />
      <div className="h-8 w-40 rounded bg-black/5 dark:bg-white/5" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-10 rounded bg-black/5 dark:bg-white/5" />
        <div className="h-10 rounded bg-black/5 dark:bg-white/5" />
        <div className="h-10 rounded bg-black/5 dark:bg-white/5" />
        <div className="h-10 rounded bg-black/5 dark:bg-white/5" />
      </div>
    </div>
  );
}

export default function ProviderSafetyCard() {
  const notify = useNotificationStore();
  const { formatDateTime } = useDateTimeFormat();
  const [providers, setProviders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [draftMax, setDraftMax] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [providerSwitchLoading, setProviderSwitchLoading] = useState(false);
  const [saveProcess, setSaveProcess] = useState(PROCESS_STATE.IDLE);
  const [resetBusy, setResetBusy] = useState(false);

  const selectionSeq = useRef(0);
  const mutationSeq = useRef(0);
  const mutationInFlight = useRef(false);
  const hasLoadedOnce = useRef(false);
  const cardStateRef = useRef({
    providers: [],
    selectedProviderId: "",
    snapshot: null,
    draftMax: 1,
  });

  cardStateRef.current = {
    providers,
    selectedProviderId,
    snapshot,
    draftMax,
  };

  const providerOptions = useMemo(
    () => providers.map((p) => ({
      value: p.providerId,
      label: p.label,
      description: p.description,
      icon: p.icon || (p.providerId === GENERIC_SAFETY_KEY ? "lan" : "hub"),
    })),
    [providers],
  );

  const applyFetchPatch = useCallback((patch) => {
    if (!patch) return;
    if (patch.providers) setProviders(patch.providers);
    if (patch.snapshot) setSnapshot(patch.snapshot);
    if (patch.draftMax != null) setDraftMax(patch.draftMax);
    if (patch.initialLoading === false) setInitialLoading(false);
    if (patch.providerSwitchLoading === false) setProviderSwitchLoading(false);
  }, []);

  const loadSnapshot = useCallback(async (providerId, mode) => {
    const capturedSelection = selectionSeq.current;
    const targetProviderId = providerId || cardStateRef.current.selectedProviderId;
    let deferLoadingClear = false;

    try {
      const qs = targetProviderId ? `?providerId=${encodeURIComponent(targetProviderId)}` : "";
      const res = await fetch(`/api/go-engine/provider-safety${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load provider safety");

      if (mode === FETCH_MODE.INITIAL && !targetProviderId) {
        const incomingProviders = data.providers || [];
        if (incomingProviders.length
          && !cardStateRef.current.providers.length) {
          setProviders(incomingProviders);
        }
        const firstProviderId = data.selectedProviderId || incomingProviders[0]?.providerId || "";
        if (firstProviderId && !cardStateRef.current.selectedProviderId) {
          deferLoadingClear = true;
          setSelectedProviderId(firstProviderId);
          return null;
        }
      }

      const patch = applyProviderSafetyFetchResult(cardStateRef.current, {
        data,
        mode,
        capturedSelectionSeq: capturedSelection,
        activeSelectionSeq: selectionSeq.current,
        targetProviderId: targetProviderId || data.providerId,
        mutationInFlight: mutationInFlight.current,
        mutationSeq: mutationSeq.current,
        activeMutationSeq: mutationSeq.current,
      });

      applyFetchPatch(patch);
      return data;
    } catch (error) {
      if (capturedSelection === selectionSeq.current) {
        if (mode !== FETCH_MODE.POLL) notify.error(error.message);
      }
      return null;
    } finally {
      if (capturedSelection === selectionSeq.current && !deferLoadingClear) {
        if (mode === FETCH_MODE.INITIAL) setInitialLoading(false);
        if (mode === FETCH_MODE.PROVIDER_SWITCH) {
          setProviderSwitchLoading(false);
          setInitialLoading(false);
        }
      }
    }
  }, [applyFetchPatch, notify]);

  useEffect(() => {
    selectionSeq.current += 1;
    const mode = hasLoadedOnce.current ? FETCH_MODE.PROVIDER_SWITCH : FETCH_MODE.INITIAL;
    hasLoadedOnce.current = true;

    if (mode === FETCH_MODE.INITIAL) setInitialLoading(true);
    else if (selectedProviderId) setProviderSwitchLoading(true);

    void loadSnapshot(selectedProviderId, mode);

    const scheduler = createPollScheduler({
      intervalMs: POLL_INTERVAL_MS,
      poll: () => loadSnapshot(selectedProviderId, FETCH_MODE.POLL),
      isActive: () => {
        if (typeof document !== "undefined" && document.hidden) return false;
        return Boolean(selectedProviderId);
      },
    });

    scheduler.start();
    return () => scheduler.stop();
  }, [selectedProviderId, loadSnapshot]);

  const handleProviderChange = useCallback((event) => {
    const nextProviderId = event.target.value;
    if (!nextProviderId || nextProviderId === selectedProviderId) return;
    setSelectedProviderId(nextProviderId);
  }, [selectedProviderId]);

  const editable = snapshot?.editable !== false && snapshot?.managedBy !== "environment";
  const dirty = isDirtyState(snapshot, draftMax);
  const showIncreaseWarning = snapshot?.recommendedProviderMax != null
    && draftMax > snapshot.recommendedProviderMax
    && dirty;
  const selectLoading = shouldShowSelectLoading({ initialLoading, providerSwitchLoading });

  const save = async () => {
    if (!selectedProviderId || !editable || saveProcess === PROCESS_STATE.LOADING) return;

    mutationSeq.current += 1;
    const capturedMutation = mutationSeq.current;
    mutationInFlight.current = true;
    setSaveProcess(PROCESS_STATE.LOADING);

    try {
      const res = await fetch("/api/go-engine/provider-safety", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: selectedProviderId, providerMax: draftMax }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      const patch = applyProviderSafetyFetchResult(cardStateRef.current, {
        data,
        mode: FETCH_MODE.SAVE_SUCCESS,
        capturedSelectionSeq: selectionSeq.current,
        activeSelectionSeq: selectionSeq.current,
        targetProviderId: selectedProviderId,
        mutationInFlight: false,
        mutationSeq: capturedMutation,
        activeMutationSeq: mutationSeq.current,
      });
      applyFetchPatch(patch);

      setSaveProcess(PROCESS_STATE.SUCCESS);
      notify.success("Provider safety saved");
      setTimeout(() => setSaveProcess(PROCESS_STATE.IDLE), 1200);
    } catch (error) {
      setSaveProcess(PROCESS_STATE.ERROR);
      notify.error(error.message);
      setTimeout(() => setSaveProcess(PROCESS_STATE.IDLE), 1200);
    } finally {
      mutationInFlight.current = false;
    }
  };

  const reset = async () => {
    if (!selectedProviderId || !editable || resetBusy) return;

    mutationSeq.current += 1;
    const capturedMutation = mutationSeq.current;
    mutationInFlight.current = true;
    setResetBusy(true);

    try {
      const res = await fetch("/api/go-engine/provider-safety", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: selectedProviderId, action: "reset" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      const patch = applyProviderSafetyFetchResult(cardStateRef.current, {
        data,
        mode: FETCH_MODE.RESET_SUCCESS,
        capturedSelectionSeq: selectionSeq.current,
        activeSelectionSeq: selectionSeq.current,
        targetProviderId: selectedProviderId,
        mutationInFlight: false,
        mutationSeq: capturedMutation,
        activeMutationSeq: mutationSeq.current,
      });
      applyFetchPatch(patch);

      notify.success("Reset to recommended");
    } catch (error) {
      notify.error(error.message);
    } finally {
      mutationInFlight.current = false;
      setResetBusy(false);
    }
  };

  const healthSemantic = getEngineHealthSemantic(snapshot?.providerHealth || "Unknown");

  return (
    <Card
      title="Provider Safety"
      subtitle="Control upstream concurrency and protection per provider."
      icon="health_and_safety"
    >
      {initialLoading && !snapshot ? (
        <ProviderSafetySkeleton />
      ) : providers.length === 0 ? (
        <p className="text-sm text-text-muted">No applicable providers found in registry.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-text-muted">Provider</p>
            <Select
              variant="descriptive"
              icon="hub"
              triggerLabel="Provider"
              menuTitle="Provider"
              value={selectedProviderId}
              options={providerOptions}
              onChange={handleProviderChange}
              loading={selectLoading}
              fullWidth
              searchable
              renderOption={renderProviderOption}
              renderTriggerValue={(selected) => (
                <span className="flex min-w-0 items-center gap-2">
                  <ProviderSafetyOption option={selected} size={18} />
                  <span className="truncate">{selected.label}</span>
                </span>
              )}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-text-muted">Max Concurrent Requests</p>
              <p
                className="text-[11px] text-text-muted"
                title="Maximum simultaneous requests HAI-Router may send to this provider."
              >
                Upstream concurrency limit for this provider.
              </p>
            </div>
            <NumericStepper
              value={draftMax}
              min={1}
              max={snapshot?.maxAllowed ?? 64}
              disabled={!editable || saveProcess === PROCESS_STATE.LOADING}
              onChange={setDraftMax}
            />
          </div>

          {showIncreaseWarning ? (
            <p className={`text-xs ${getSemanticTextClass("warning")}`}>
              Increasing provider concurrency may trigger rate limits or temporary access restrictions on shared/free providers.
            </p>
          ) : null}

          {dirty ? (
            <p className={`text-xs ${getSemanticTextClass("warning")}`}>
              Pending change — runtime limit remains {snapshot?.effectiveProviderMax ?? "—"} until saved.
            </p>
          ) : null}

          {snapshot?.managedBy === "environment" ? (
            <p className={`text-xs ${getSemanticTextClass("warning")}`}>
              Effective limit is managed by environment configuration.
            </p>
          ) : null}

          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-muted">Protection</dt>
              <dd className="font-medium">{snapshot?.protectionEnabled ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Provider Health</dt>
              <dd>
                <Badge variant={healthSemantic} size="sm">{snapshot?.providerHealth || "Unknown"}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Active / Limit</dt>
              <dd className="font-medium tabular-nums">
                {snapshot?.active ?? 0} / {snapshot?.effectiveProviderMax ?? snapshot?.limit ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Queued</dt>
              <dd className="font-medium tabular-nums">{snapshot?.queued ?? 0}</dd>
            </div>
            {snapshot?.cooldownRemainingMs > 0 ? (
              <div className="sm:col-span-2">
                <dt className="text-text-muted">Cooldown</dt>
                <dd className="font-medium">
                  {Math.ceil(snapshot.cooldownRemainingMs / 1000)}s remaining
                  {snapshot.cooldownUntil ? ` · retry after ${formatDateTime(snapshot.cooldownUntil)}` : ""}
                </dd>
              </div>
            ) : null}
            {snapshot?.lastFailure ? (
              <div className="sm:col-span-2">
                <dt className="text-text-muted">Last Failure</dt>
                <dd className="text-text-main">{snapshot.lastFailure}</dd>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Recommended</dt>
              <dd className="font-medium">
                {snapshot?.recommendedProviderMax ?? "Default"}
                {snapshot?.recommendationNote ? ` · ${snapshot.recommendationNote}` : ""}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={!editable || resetBusy || !snapshot?.hasOverride}
              onClick={reset}
            >
              {resetBusy ? "Resetting…" : "Reset to Recommended"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon="save"
              disabled={!editable || !dirty || saveProcess === PROCESS_STATE.LOADING}
              processState={saveProcess}
              processLabels={{
                idle: "Save",
                loading: "Saving…",
                success: "Saved",
                error: "Failed",
              }}
              onClick={save}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
