"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, ConfirmModal, GoEnginePageSkeleton, MdiIcon } from "@/shared/components";
import { PROCESS_STATE } from "@/shared/constants/buttonProcess";
import { useDateTimeFormat } from "@/shared/hooks/useDateTimeFormat";
import { getGoEngineControls } from "@/shared/utils/goEngineControls";
import {
  canAddWorker,
  canDeleteWorker,
  getAddWorkerDisabledReason,
  getDeleteWorkerDisabledReason,
} from "@/shared/utils/goEngineWorkerControls";
import {
  getActiveCountSemantic,
  getEngineEventSemantic,
  getEngineHealthSemantic,
  getEngineStateSemantic,
  getSemanticTextClass,
  getWorkerHealthSemantic,
} from "@/shared/utils/statusSemantic";
import { useNotificationStore } from "@/store/notificationStore";
import { createPollScheduler } from "@/shared/utils/pollScheduler.js";
import ProviderSafetyCard from "./ProviderSafetyCard";

const STATUS_POLL_MS = 3000;

function ScrollPanel({ children, className = "" }) {
  return (
    <div
      className={`min-h-[8rem] max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-black/[0.06] bg-black/[0.02] px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.02] ${className}`}
    >
      {children}
    </div>
  );
}

export default function GoEngineClient() {
  const [status, setStatus] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [addProcess, setAddProcess] = useState(PROCESS_STATE.IDLE);
  const [deleteBusyId, setDeleteBusyId] = useState("");
  const [confirmDeleteWorker, setConfirmDeleteWorker] = useState(null);
  const notify = useNotificationStore();
  const { formatDateTime } = useDateTimeFormat();
  const generation = useRef(0);
  const fetchInFlight = useRef(false);

  const fetchStatus = useCallback(async ({ initial = false } = {}) => {
    if (fetchInFlight.current && !initial) return;
    fetchInFlight.current = true;
    const gen = generation.current;
    try {
      const res = await fetch("/api/go-engine/status", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) return;
      if (gen !== generation.current) return;
      setStatus(data);
    } catch (error) {
      console.log("Go engine status error:", error.message);
    } finally {
      fetchInFlight.current = false;
      if (initial && gen === generation.current) setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus({ initial: true });
    const scheduler = createPollScheduler({
      intervalMs: STATUS_POLL_MS,
      poll: () => fetchStatus({ initial: false }),
      isActive: () => typeof document === "undefined" || !document.hidden,
    });
    scheduler.start();
    return () => scheduler.stop();
  }, [fetchStatus]);

  const runAction = async (action) => {
    if (busy) return;
    setBusy(action);
    generation.current += 1;
    try {
      const res = await fetch("/api/go-engine/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error || `Failed to ${action}`);
        generation.current += 1;
        await fetchStatus({ initial: false });
        return;
      }
      setStatus(data);
      generation.current += 1;
      notify.success(`Go engine: ${action}`);
    } catch (error) {
      notify.error(error.message);
      generation.current += 1;
      await fetchStatus({ initial: false });
    } finally {
      setBusy("");
    }
  };

  const runWorkerAction = async (action, workerId = null) => {
    if (busy || deleteBusyId || addProcess === PROCESS_STATE.LOADING) return;

    if (action === "add-worker") {
      setAddProcess(PROCESS_STATE.LOADING);
    } else if (action === "remove-worker" && workerId) {
      setDeleteBusyId(workerId);
    }

    generation.current += 1;
    try {
      const res = await fetch("/api/go-engine/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workerId ? { action, workerId } : { action }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (action === "add-worker") setAddProcess(PROCESS_STATE.ERROR);
        notify.error(data.error || `Failed to ${action}`);
        generation.current += 1;
        await fetchStatus({ initial: false });
        if (action === "add-worker") {
          setTimeout(() => setAddProcess(PROCESS_STATE.IDLE), 1200);
        }
        return;
      }
      setStatus(data);
      generation.current += 1;
      if (action === "add-worker") {
        setAddProcess(PROCESS_STATE.SUCCESS);
        notify.success("Worker added");
        setTimeout(() => setAddProcess(PROCESS_STATE.IDLE), 1200);
      } else {
        notify.success(`Worker ${workerId} removed`);
      }
    } catch (error) {
      if (action === "add-worker") setAddProcess(PROCESS_STATE.ERROR);
      notify.error(error.message);
      generation.current += 1;
      await fetchStatus({ initial: false });
      if (action === "add-worker") {
        setTimeout(() => setAddProcess(PROCESS_STATE.IDLE), 1200);
      }
    } finally {
      setDeleteBusyId("");
      setConfirmDeleteWorker(null);
    }
  };

  const requestDeleteWorker = (worker) => {
    if (!worker || deleteBusyId) return;
    if ((worker.activeRequests ?? 0) > 0) {
      setConfirmDeleteWorker(worker);
      return;
    }
    runWorkerAction("remove-worker", worker.workerId);
  };

  if (initialLoading && !status) {
    return <GoEnginePageSkeleton />;
  }

  const workers = status?.workers || [];
  const controls = getGoEngineControls(status?.state, { busy: !!busy });
  const workerMutationBusy = !!busy || !!deleteBusyId || addProcess === PROCESS_STATE.LOADING;
  const addWorkerEnabled = canAddWorker(status, { busy: workerMutationBusy });
  const addWorkerTooltip = getAddWorkerDisabledReason(status, { busy: workerMutationBusy });
  const displayState = busy
    ? ({ start: "STARTING", pause: "PAUSING", resume: "RUNNING", stop: "STOPPING", restart: "RESTARTING" }[busy] || status?.state)
    : status?.state;

  const activeSemantic = getActiveCountSemantic(status?.activeRequests ?? 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-1 sm:gap-6 sm:px-0">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Go Engine</h1>
        <p className="mt-1 text-sm text-text-muted">
          Canonical HAI-Router provider transport — all provider network egress runs through Go workers.
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getEngineStateSemantic(displayState)} dot>{displayState || "UNKNOWN"}</Badge>
            <Badge variant={getEngineHealthSemantic(status?.health)}>{status?.health || "Unknown"}</Badge>
            <Badge variant={activeSemantic}>Active: {status?.activeRequests ?? 0}</Badge>
            <Badge variant="default" title="Workers provide internal transport capacity. Provider concurrency is configured separately.">
              Workers: {status?.runningWorkers ?? 0}
            </Badge>
          </div>

          {!status?.binaryFound && (
            <p className={`text-sm ${getSemanticTextClass("warning")}`}>
              Worker binary not found. Run <code className="text-xs">npm run build:go-engine</code> or set HAI_GO_WORKER_PATH.
            </p>
          )}

          {status?.autostartSuppressed && status?.state === "STOPPED" && (
            <p className="text-sm text-text-muted">
              Engine was manually stopped. Press Start to run again, or restart HAI-Router to auto-start on boot.
            </p>
          )}

          {status?.lastError && (
            <p className={`break-words text-sm ${getSemanticTextClass("error")}`}>{status.lastError}</p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              size="sm"
              variant="success"
              icon="play_arrow"
              disabled={!controls.start}
              processState={busy === "start" ? PROCESS_STATE.STARTING : PROCESS_STATE.IDLE}
              processLabels={{ idle: "Start", starting: "Starting" }}
              onClick={() => runAction("start")}
            />
            <Button
              size="sm"
              variant="secondary"
              icon="pause"
              disabled={!controls.pause}
              processState={busy === "pause" ? PROCESS_STATE.PAUSING : PROCESS_STATE.IDLE}
              processLabels={{ idle: "Pause", pausing: "Pausing" }}
              onClick={() => runAction("pause")}
            />
            <Button
              size="sm"
              variant="success"
              icon="play_circle"
              disabled={!controls.resume}
              processState={busy === "resume" ? PROCESS_STATE.RESUMING : PROCESS_STATE.IDLE}
              processLabels={{ idle: "Resume", resuming: "Resuming" }}
              onClick={() => runAction("resume")}
            />
            <Button
              size="sm"
              variant="danger"
              icon="stop"
              disabled={!controls.stop}
              processState={busy === "stop" ? PROCESS_STATE.STOPPING : PROCESS_STATE.IDLE}
              processLabels={{ idle: "Stop", stopping: "Stopping" }}
              onClick={() => runAction("stop")}
            />
            <Button
              size="sm"
              variant="secondary"
              icon="restart_alt"
              disabled={!controls.restart}
              processState={busy === "restart" ? PROCESS_STATE.RESTARTING : PROCESS_STATE.IDLE}
              processLabels={{ idle: "Restart Workers", restarting: "Restarting" }}
              onClick={() => runAction("restart")}
            />
          </div>
        </div>
      </Card>

      <ProviderSafetyCard />

      <Card title="Engine Status">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-text-muted">Version</dt><dd className="font-medium">{status?.version || "—"}</dd></div>
          <div><dt className="text-text-muted">Protocol</dt><dd className="font-medium">{status?.protocolVersion || "—"}</dd></div>
          <div><dt className="text-text-muted">Desired Workers</dt><dd className="font-medium">{status?.desiredWorkerCount ?? "—"}</dd></div>
          <div><dt className="text-text-muted">Healthy Workers</dt><dd className="font-medium">{status?.healthyWorkers ?? 0} / {status?.runningWorkers ?? 0}</dd></div>
          <div><dt className="text-text-muted">Started At</dt><dd className="font-medium">{status?.startedAt ? formatDateTime(status.startedAt) : "—"}</dd></div>
          <div><dt className="text-text-muted">Canonical</dt><dd className="font-medium">{status?.canonical ? "Yes (default)" : "Disabled"}</dd></div>
        </dl>
      </Card>

      <Card
        title="Worker Processes"
        className="flex min-h-0 flex-col"
        action={(
          <Button
            size="sm"
            variant="secondary"
            icon="add"
            disabled={!addWorkerEnabled}
            title={addWorkerTooltip || undefined}
            processState={addProcess}
            processLabels={{
              idle: "Add Worker",
              loading: "Adding...",
              success: "Added",
              error: "Failed",
            }}
            onClick={() => runWorkerAction("add-worker")}
          />
        )}
      >
        {workers.length === 0 ? (
          <p className="text-sm text-text-muted">No workers running.</p>
        ) : (
          <ScrollPanel>
            <div className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {workers.map((w) => {
                const deleteEnabled = canDeleteWorker(status, w, { busy: workerMutationBusy });
                const deleteTooltip = getDeleteWorkerDisabledReason(status, w, { busy: workerMutationBusy });
                const isDeleting = deleteBusyId === w.workerId || w.lifecycle === "DRAINING";
                const displayHealth = w.health === "Draining" ? "Draining" : w.health;

                return (
                  <div key={w.workerId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{w.workerId}</p>
                      <p className="break-all text-xs text-text-muted">{w.addr}{w.pid ? ` · pid ${w.pid}` : ""}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={getWorkerHealthSemantic(displayHealth)} size="sm">{displayHealth}</Badge>
                      <Badge variant={getActiveCountSemantic(w.activeRequests ?? 0)} size="sm">
                        active {w.activeRequests ?? 0}
                      </Badge>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted"
                        disabled={!deleteEnabled || isDeleting}
                        title={deleteTooltip || "Delete worker"}
                        aria-label={`Delete ${w.workerId}`}
                        onClick={() => requestDeleteWorker(w)}
                      >
                        {isDeleting ? (
                          <MdiIcon name="progress_activity" size={18} spin />
                        ) : (
                          <MdiIcon name="delete" size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollPanel>
        )}
      </Card>

      <ConfirmModal
        isOpen={Boolean(confirmDeleteWorker)}
        onClose={() => setConfirmDeleteWorker(null)}
        onConfirm={() => runWorkerAction("remove-worker", confirmDeleteWorker?.workerId)}
        title="Drain & Remove Worker"
        message={
          confirmDeleteWorker
            ? `Worker has ${confirmDeleteWorker.activeRequests ?? 0} active request(s). HAI-Router will drain them before removal.`
            : ""
        }
        confirmText="Drain & Remove"
        cancelText="Cancel"
        loading={Boolean(deleteBusyId)}
      />

      <Card title="Recent Engine Events" className="flex min-h-0 flex-col">
        <p className="mb-2 text-xs text-text-muted">
          Persisted for audit — events are stored in the local database and are not cleared on refresh.
        </p>
        {status?.recentEvents?.length > 0 ? (
          <ScrollPanel>
            <ul className="space-y-2 text-xs">
              {status.recentEvents.map((evt, i) => {
                const variant = getEngineEventSemantic(evt.event, evt.level);
                return (
                  <li key={`${evt.at}-${evt.event}-${evt.workerId || ""}-${i}`} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 break-words">
                    <Badge variant={variant} size="sm">{evt.event}</Badge>
                    <span className="text-text-muted">{formatDateTime(evt.at)}</span>
                    {evt.workerId ? (
                      <span className="text-text-muted">{evt.workerId}</span>
                    ) : null}
                    {evt.message && evt.message !== evt.event ? (
                      <span className={getSemanticTextClass(variant)}>{evt.message}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </ScrollPanel>
        ) : (
          <p className="text-sm text-text-muted">No engine events recorded yet.</p>
        )}
      </Card>
    </div>
  );
}
