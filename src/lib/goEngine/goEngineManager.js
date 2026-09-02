import { logGoEngineEvent } from "./goEngineLogger.js";
import { getEngineEventSemantic } from "@/shared/utils/statusSemantic.js";
import { appendGoEngineEvent, listGoEngineEvents } from "@/lib/db/repos/goEngineEventsRepo.js";
import {
  GoWorkerManager,
  WORKER_LIFECYCLE,
  MAX_WORKER_COUNT,
  MIN_WORKER_COUNT,
  parseWorkerId,
  resolveWorkerBinary,
  isGoEngineEnabled,
  isGoEngineExplicitlyDisabled,
} from "./workerManager.js";
import { persistDesiredWorkerCount, resolveDesiredWorkerCount } from "./goEngineSettings.js";

export const ENGINE_STATES = Object.freeze({
  STOPPED: "STOPPED",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  PAUSING: "PAUSING",
  PAUSED: "PAUSED",
  STOPPING: "STOPPING",
  RESTARTING: "RESTARTING",
  FAILED: "FAILED",
});

function getShutdownDrainMs() {
  return Number(process.env.HAI_GO_SHUTDOWN_DRAIN_MS || 30000);
}
const MAX_RECENT_EVENTS = 40;
const EVENTS_LIST_LIMIT = 500;
const EXPECTED_PROTOCOL = "1";

const g = global.__haiGoEngineManager ??= {
  instance: null,
  bootPromise: null,
  shutdownPromise: null,
};

function pushEvent(manager, event, message, level, extra = {}) {
  const entry = {
    at: new Date().toISOString(),
    event,
    message: message || event,
    level: level || getEngineEventSemantic(event),
    workerId: extra.workerId || undefined,
  };
  manager.recentEvents.unshift(entry);
  if (manager.recentEvents.length > MAX_RECENT_EVENTS) {
    manager.recentEvents.length = MAX_RECENT_EVENTS;
  }
  appendGoEngineEvent(entry).catch(() => {});
}

export class GoEngineManager {
  constructor() {
    this.state = ENGINE_STATES.STOPPED;
    this.workerManager = null;
    /** @type {Map<string, { workerId: string, providerId?: string, connectionId?: string, startedAt: number }>} */
    this.activeRequests = new Map();
    this.admissionOpen = false;
    this.operationChain = Promise.resolve();
    this.recentEvents = [];
    this.lastError = null;
    this.desiredWorkerCount = MIN_WORKER_COUNT;
    this.desiredWorkerCountLoaded = false;
    this.protocolVersion = null;
    this.workerVersion = null;
    this.startedAt = null;
    /** When true, bootstrap/ensure must not restart until manual Start or process restart. */
    this.autostartSuppressed = false;
  }

  enqueue(fn) {
    const run = () => fn();
    this.operationChain = this.operationChain.then(run, run);
    return this.operationChain;
  }

  getActiveCount() {
    return this.activeRequests.size;
  }

  canAdmitRequests() {
    return this.state === ENGINE_STATES.RUNNING && this.admissionOpen && this.workerManager;
  }

  assertAdmission() {
    if (this.state === ENGINE_STATES.PAUSED || this.state === ENGINE_STATES.PAUSING) {
      const err = new Error("Go provider engine is paused");
      err.code = "engine_paused";
      throw err;
    }
    if (this.state === ENGINE_STATES.STOPPING) {
      const err = new Error("Go provider engine is stopping");
      err.code = "engine_stopping";
      throw err;
    }
    if (!this.canAdmitRequests()) {
      const err = new Error(this.lastError || "Go provider engine unavailable");
      err.code = "worker_unavailable";
      throw err;
    }
  }

  trackRequest(requestId, meta = {}) {
    if (!requestId) return;
    if (this.activeRequests.has(requestId)) return;
    this.activeRequests.set(requestId, {
      workerId: meta.workerId || "",
      providerId: meta.providerId || "",
      connectionId: meta.connectionId || "",
      startedAt: Date.now(),
    });
  }

  completeRequest(requestId) {
    if (!requestId) return;
    this.activeRequests.delete(requestId);
  }

  async ensureDesiredWorkerCount() {
    if (this.desiredWorkerCountLoaded) return this.desiredWorkerCount;
    this.desiredWorkerCount = await resolveDesiredWorkerCount();
    this.desiredWorkerCountLoaded = true;
    return this.desiredWorkerCount;
  }

  _countActiveForWorker(workerId) {
    let count = 0;
    for (const meta of this.activeRequests.values()) {
      if (meta.workerId === workerId) count += 1;
    }
    return count;
  }

  _makeWorkerManager() {
    return new GoWorkerManager({
      onWorkerLog: (index, line) => {
        import("./goEngineLogger.js").then(({ parseWorkerLogLine }) => parseWorkerLogLine(line, index)).catch(() => {});
      },
      onWorkerExit: (index, code, signal) => this._handleWorkerExit(index, code, signal),
    });
  }

  _handleWorkerExit(index, code, signal) {
    const wm = this.workerManager;
    if (!wm) return;

    const worker = wm.findWorker(index);
    const wasStopping = worker?.lifecycle === WORKER_LIFECYCLE.STOPPING;
    wm.removeWorkerByIndex(index);

    if (wasStopping || [ENGINE_STATES.STOPPING, ENGINE_STATES.RESTARTING].includes(this.state)) {
      return;
    }

    logGoEngineEvent({
      level: "error",
      component: "GO:WORKER",
      event: "worker_crashed",
      workerId: `worker-${index}`,
      message: `exit code=${code} signal=${signal || ""} active=${this.getActiveCount()}`,
    });
    pushEvent(this, "worker_crashed", `worker-${index} exit code=${code}`, "error", { workerId: `worker-${index}` });

    if (this.state !== ENGINE_STATES.RUNNING) return;

    const assignable = wm.getAssignableWorkers();
    if (assignable.length === 0) {
      this.admissionOpen = false;
      if (wm.workers.length === 0) {
        this.state = ENGINE_STATES.FAILED;
        this.lastError = `worker ${index} crashed`;
      } else {
        this.lastError = `worker ${index} crashed — no assignable workers`;
      }
    }
  }

  _assertTopologyMutation(status) {
    if (this.state !== ENGINE_STATES.RUNNING) {
      const err = new Error(`Engine is ${this.state}`);
      err.code = "engine_not_running";
      err.status = 409;
      throw err;
    }
    if (status.health !== "Healthy") {
      const err = new Error(`Engine health is ${status.health}`);
      err.code = "engine_not_healthy";
      err.status = 409;
      throw err;
    }
  }

  pickWorker({ sessionId, providerId, connectionId, egressMode = "direct" } = {}) {
    this.assertAdmission();
    const loadByWorkerId = new Map();
    for (const w of this.workerManager.workers) {
      loadByWorkerId.set(`worker-${w.index}`, 0);
    }
    for (const meta of this.activeRequests.values()) {
      const id = meta.workerId || "";
      if (id) loadByWorkerId.set(id, (loadByWorkerId.get(id) || 0) + 1);
    }
    const worker = this.workerManager.pickWorker({
      sessionId,
      providerId,
      connectionId,
      egressMode,
      loadByWorkerId,
    });
    if (!worker) {
      const err = new Error("No Go worker available");
      err.code = "worker_unavailable";
      throw err;
    }
    return worker;
  }

  async _probeWorker(worker) {
    const { originalFetch } = await import("../../../open-sse/utils/proxyFetch.js");
    const healthRes = await originalFetch(`${worker.baseUrl}/health`, {
      headers: { "X-HAI-Worker-Token": worker.authToken },
    });
    if (!healthRes.ok) throw new Error(`worker ${worker.index} health check failed`);

    const versionRes = await originalFetch(`${worker.baseUrl}/version`, {
      headers: { "X-HAI-Worker-Token": worker.authToken },
    });
    if (!versionRes.ok) throw new Error(`worker ${worker.index} version check failed`);
    const version = await versionRes.json();
    if (version.protocol !== EXPECTED_PROTOCOL) {
      throw new Error(`protocol mismatch: worker=${version.protocol} expected=${EXPECTED_PROTOCOL}`);
    }
    return version;
  }

  async _fetchWorkerStatus(worker) {
    try {
      const { originalFetch } = await import("../../../open-sse/utils/proxyFetch.js");
      const res = await originalFetch(`${worker.baseUrl}/status`, {
        headers: { "X-HAI-Worker-Token": worker.authToken },
      });
      if (!res.ok) return { healthy: false, activeRequests: 0 };
      const data = await res.json();
      return {
        healthy: data.ok === true,
        activeRequests: Number(data.activeRequests || 0),
        maxInflight: Number(data.maxInflight || 0),
        uptimeMs: Number(data.uptimeMs || 0),
      };
    } catch {
      return { healthy: false, activeRequests: 0 };
    }
  }

  async start({ manual = false } = {}) {
    return this.enqueue(async () => {
      if (manual) this.autostartSuppressed = false;
      if (this.state === ENGINE_STATES.RUNNING) return this.getStatus();
      if (this.state === ENGINE_STATES.STARTING) return this.getStatus();
      if (!isGoEngineEnabled()) {
        throw new Error("Go engine is disabled (set HAI_GO_ENGINE=1 to enable, or unset HAI_GO_ENGINE=0)");
      }

      this.state = ENGINE_STATES.STARTING;
      this.lastError = null;
      pushEvent(this, "start_requested");
      logGoEngineEvent({ level: "info", component: "GO_ENGINE", event: "start_requested", message: "engine start requested" });

      try {
        if (!resolveWorkerBinary()) {
          throw new Error("Go worker binary not found (build go-engine or set HAI_GO_WORKER_PATH)");
        }

        await this.ensureDesiredWorkerCount();
        this.workerManager = this._makeWorkerManager();
        await this.workerManager.startInitial(this.desiredWorkerCount);
        const first = this.workerManager.workers[0];
        const version = await this._probeWorker(first);
        this.protocolVersion = version.protocol;
        this.workerVersion = version.worker;

        this.admissionOpen = true;
        this.state = ENGINE_STATES.RUNNING;
        this.startedAt = Date.now();
        pushEvent(this, "engine_running", `workers=${this.workerManager.workers.length}`);
        logGoEngineEvent({
          level: "info",
          component: "GO_ENGINE",
          event: "engine_running",
          message: `${this.workerManager.workers.length} worker(s) ready protocol=${this.protocolVersion}`,
        });
      } catch (err) {
        this.state = ENGINE_STATES.FAILED;
        this.admissionOpen = false;
        this.lastError = err.message;
        pushEvent(this, "start_failed", err.message, "error");
        logGoEngineEvent({ level: "error", component: "GO_ENGINE", event: "start_failed", message: err.message });
        try { await this.workerManager?.shutdown(); } catch { /* ignore */ }
        this.workerManager = null;
        throw err;
      }

      return this.getStatus();
    });
  }

  async pause() {
    return this.enqueue(async () => {
      if (this.state !== ENGINE_STATES.RUNNING) return this.getStatus();
      this.state = ENGINE_STATES.PAUSING;
      this.admissionOpen = false;
      pushEvent(this, "pause_requested");
      logGoEngineEvent({ level: "info", component: "GO_ENGINE", event: "pause_requested", message: "admission closed" });

      const drainDeadline = Date.now() + getShutdownDrainMs();
      while (this.getActiveCount() > 0 && Date.now() < drainDeadline) {
        await new Promise((r) => setTimeout(r, 100));
      }

      this.state = ENGINE_STATES.PAUSED;
      pushEvent(this, "paused", `active=${this.getActiveCount()}`);
      logGoEngineEvent({
        level: "info",
        component: "GO_ENGINE",
        event: "paused",
        message: `draining complete active=${this.getActiveCount()}`,
      });
      return this.getStatus();
    });
  }

  async resume() {
    return this.enqueue(async () => {
      if (this.state !== ENGINE_STATES.PAUSED) return this.getStatus();
      if (!this.workerManager) {
        return this.start();
      }
      this.admissionOpen = true;
      this.state = ENGINE_STATES.RUNNING;
      pushEvent(this, "resumed");
      logGoEngineEvent({ level: "info", component: "GO_ENGINE", event: "resumed", message: "admission reopened" });
      return this.getStatus();
    });
  }

  async stop({ manual = false } = {}) {
    return this.enqueue(async () => {
      if (this.state === ENGINE_STATES.STOPPED) return this.getStatus();
      this.state = ENGINE_STATES.STOPPING;
      this.admissionOpen = false;
      pushEvent(this, "shutdown_started");
      logGoEngineEvent({ level: "info", component: "GO_ENGINE", event: "shutdown_started", message: "engine stopping" });

      const drainDeadline = Date.now() + getShutdownDrainMs();
      while (this.getActiveCount() > 0 && Date.now() < drainDeadline) {
        await new Promise((r) => setTimeout(r, 100));
      }

      if (this.workerManager) {
        await this.workerManager.shutdown();
        this.workerManager = null;
      }

      this.activeRequests.clear();
      this.state = ENGINE_STATES.STOPPED;
      this.startedAt = null;
      if (manual) this.autostartSuppressed = true;
      pushEvent(this, "shutdown_complete");
      logGoEngineEvent({ level: "info", component: "GO_ENGINE", event: "shutdown_complete", message: "engine stopped" });
      return this.getStatus();
    });
  }

  async restartWorkers() {
    return this.enqueue(async () => {
      if (!this.workerManager) {
        return this.start();
      }

      const prevState = this.state;
      this.state = ENGINE_STATES.RESTARTING;
      this.admissionOpen = false;
      pushEvent(this, "worker_restart_started");
      logGoEngineEvent({ level: "info", component: "GO_ENGINE", event: "worker_restart_started", message: "rolling worker restart" });

      const workers = [...this.workerManager.workers];
      for (const w of workers) {
        logGoEngineEvent({
          level: "info",
          component: "GO:WORKER",
          event: "worker_draining",
          workerId: `worker-${w.index}`,
          message: "restart drain",
        });
        try { w.child.kill("SIGTERM"); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 500));
      }

      await this.workerManager.shutdown();
      this.workerManager = this._makeWorkerManager();
      this.workerManager.nextWorkerIndex = 0;
      await this.workerManager.startInitial(this.desiredWorkerCount);
      const version = await this._probeWorker(this.workerManager.workers[0]);
      this.protocolVersion = version.protocol;
      this.workerVersion = version.worker;

      this.admissionOpen = true;
      this.state = prevState === ENGINE_STATES.PAUSED ? ENGINE_STATES.PAUSED : ENGINE_STATES.RUNNING;
      if (this.state === ENGINE_STATES.PAUSED) this.admissionOpen = false;

      pushEvent(this, "worker_restart_complete");
      logGoEngineEvent({ level: "info", component: "GO_ENGINE", event: "worker_restart_complete", message: "workers restarted" });
      return this.getStatus();
    });
  }

  async addWorker() {
    return this.enqueue(async () => {
      const status = await this.getStatus();
      this._assertTopologyMutation(status);

      if ((this.workerManager?.workers.length || 0) >= MAX_WORKER_COUNT) {
        const err = new Error("Maximum worker count reached");
        err.code = "maximum_workers_reached";
        err.status = 409;
        throw err;
      }

      const workerId = `worker-${this.workerManager.nextWorkerIndex}`;
      pushEvent(this, "worker_add_requested", workerId, "info", { workerId });
      logGoEngineEvent({
        level: "info",
        component: "GO:WORKER",
        event: "worker_add_requested",
        workerId,
        message: `worker_add_requested worker=${workerId}`,
      });

      let worker = null;
      try {
        pushEvent(this, "worker_starting", workerId, "info", { workerId });
        logGoEngineEvent({
          level: "info",
          component: "GO:WORKER",
          event: "worker_starting",
          workerId,
          message: `worker_starting worker=${workerId}`,
        });

        worker = await this.workerManager.addOneWorker();
        const version = await this._probeWorker(worker);
        if (version.protocol !== EXPECTED_PROTOCOL) {
          throw new Error(`protocol mismatch: worker=${version.protocol} expected=${EXPECTED_PROTOCOL}`);
        }

        this.desiredWorkerCount += 1;
        await persistDesiredWorkerCount(this.desiredWorkerCount);

        const addedId = `worker-${worker.index}`;
        pushEvent(this, "worker_added", addedId, "success", { workerId: addedId });
        logGoEngineEvent({
          level: "info",
          component: "GO:WORKER",
          event: "worker_added",
          workerId: addedId,
          message: `worker_added worker=${addedId} pid=${worker.child?.pid ?? "?"}`,
        });
      } catch (err) {
        if (worker) {
          try { await this.workerManager.terminateWorker(worker.index); } catch { /* ignore */ }
        }
        pushEvent(this, "worker_add_failed", err.message, "error", { workerId });
        logGoEngineEvent({
          level: "error",
          component: "GO:WORKER",
          event: "worker_add_failed",
          workerId,
          message: err.message,
        });
        throw err;
      }

      return this.getStatus();
    });
  }

  async removeWorker(workerId) {
    return this.enqueue(async () => {
      const status = await this.getStatus();
      this._assertTopologyMutation(status);

      const index = parseWorkerId(workerId);
      if (index === null) {
        const err = new Error(`Invalid worker id: ${workerId}`);
        err.code = "invalid_worker_id";
        err.status = 400;
        throw err;
      }

      const wm = this.workerManager;
      const worker = wm?.findWorker(index);
      if (!worker) {
        return this.getStatus();
      }

      if (worker.lifecycle === WORKER_LIFECYCLE.DRAINING) {
        const err = new Error(`Worker ${workerId} is already draining`);
        err.code = "worker_already_draining";
        err.status = 409;
        throw err;
      }

      if (wm.workers.length <= MIN_WORKER_COUNT) {
        const err = new Error("At least one worker is required");
        err.code = "minimum_worker_required";
        err.status = 409;
        throw err;
      }

      pushEvent(this, "worker_remove_requested", workerId, "info", { workerId });
      logGoEngineEvent({
        level: "info",
        component: "GO:WORKER",
        event: "worker_remove_requested",
        workerId,
        message: `worker_remove_requested worker=${workerId}`,
      });

      wm.markDraining(index);
      pushEvent(this, "worker_draining", workerId, "warning", { workerId });
      logGoEngineEvent({
        level: "info",
        component: "GO:WORKER",
        event: "worker_draining",
        workerId,
        message: `worker_draining worker=${workerId} active=${this._countActiveForWorker(workerId)}`,
      });

      const drainDeadline = Date.now() + getShutdownDrainMs();
      while (Date.now() < drainDeadline) {
        const nodeActive = this._countActiveForWorker(workerId);
        const goStatus = await this._fetchWorkerStatus(worker);
        const active = Math.max(nodeActive, goStatus.activeRequests);
        if (active === 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      const finalNodeActive = this._countActiveForWorker(workerId);
      const finalGoStatus = await this._fetchWorkerStatus(worker);
      const finalActive = Math.max(finalNodeActive, finalGoStatus.activeRequests);

      if (finalActive > 0) {
        wm.restoreReady(index);
        const message = `Drain timeout with ${finalActive} active request(s)`;
        pushEvent(this, "worker_remove_failed", message, "error", { workerId });
        logGoEngineEvent({
          level: "error",
          component: "GO:WORKER",
          event: "worker_remove_failed",
          workerId,
          message: `worker_remove_failed reason=drain_timeout active=${finalActive}`,
        });
        const err = new Error(message);
        err.code = "drain_timeout";
        err.status = 409;
        throw err;
      }

      if (wm.workers.length <= MIN_WORKER_COUNT) {
        wm.restoreReady(index);
        const err = new Error("At least one worker is required");
        err.code = "minimum_worker_required";
        err.status = 409;
        throw err;
      }

      await wm.terminateWorker(index);
      this.desiredWorkerCount = Math.max(MIN_WORKER_COUNT, this.desiredWorkerCount - 1);
      await persistDesiredWorkerCount(this.desiredWorkerCount);

      pushEvent(this, "worker_removed", workerId, "success", { workerId });
      logGoEngineEvent({
        level: "info",
        component: "GO:WORKER",
        event: "worker_removed",
        workerId,
        message: `worker_removed worker=${workerId}`,
      });

      return this.getStatus();
    });
  }

  aggregateHealth(workerDetails, engineState = this.state) {
    if (engineState === ENGINE_STATES.STOPPED) return "Stopped";
    if (engineState === ENGINE_STATES.FAILED) return "Unhealthy";
    if (engineState === ENGINE_STATES.STARTING) return "Starting";
    if (engineState === ENGINE_STATES.STOPPING) return "Stopping";
    if (engineState === ENGINE_STATES.PAUSING) return "Pausing";
    if (engineState === ENGINE_STATES.PAUSED) return "Paused";
    if (engineState === ENGINE_STATES.RESTARTING) return "Restarting";

    const total = workerDetails.length;
    if (!total) return "Unhealthy";

    const healthyAssignable = workerDetails.filter((w) => w.health === "Healthy").length;
    const healthyOrDraining = workerDetails.filter((w) => w.health === "Healthy" || w.health === "Draining").length;
    if (healthyAssignable > 0) {
      if (healthyOrDraining === total) return "Healthy";
      return "Degraded";
    }
    if (healthyOrDraining > 0) return "Degraded";
    return "Unhealthy";
  }

  async getStatus() {
    const workers = this.workerManager?.workers || [];
    const workerDetails = await Promise.all(workers.map(async (w) => {
      const st = await this._fetchWorkerStatus(w);
      const lifecycle = w.lifecycle || WORKER_LIFECYCLE.READY;
      let health = st.healthy ? "Healthy" : "Unhealthy";
      if (lifecycle === WORKER_LIFECYCLE.DRAINING) health = "Draining";
      if (lifecycle === WORKER_LIFECYCLE.STARTING) health = "Starting";
      return {
        workerId: `worker-${w.index}`,
        index: w.index,
        pid: w.child?.pid ?? null,
        addr: w.addr,
        lifecycle,
        health,
        activeRequests: st.activeRequests,
        uptimeMs: st.uptimeMs,
        maxInflight: st.maxInflight,
      };
    }));

    const workerActiveTotal = workerDetails.reduce((sum, w) => sum + (w.activeRequests || 0), 0);
    const managerActive = this.getActiveCount();
    const activeRequests = workers.length ? workerActiveTotal : managerActive;

    let recentEvents = [];
    try {
      recentEvents = await listGoEngineEvents({ limit: EVENTS_LIST_LIMIT });
    } catch {
      recentEvents = this.recentEvents.slice(0, EVENTS_LIST_LIMIT);
    }

    return {
      state: this.state,
      health: this.aggregateHealth(workerDetails, this.state),
      enabled: isGoEngineEnabled(),
      explicitlyDisabled: isGoEngineExplicitlyDisabled(),
      autostartSuppressed: this.autostartSuppressed,
      version: this.workerVersion,
      protocolVersion: this.protocolVersion,
      activeRequests,
      desiredWorkerCount: this.desiredWorkerCount,
      runningWorkers: workers.length,
      healthyWorkers: workerDetails.filter((w) => w.health === "Healthy" || w.health === "Draining").length,
      workers: workerDetails,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      lastError: this.lastError,
      recentEvents,
      recentEventsTotal: recentEvents.length,
      binaryFound: !!resolveWorkerBinary(),
    };
  }
}

export function getGoEngineManager() {
  if (!g.instance) g.instance = new GoEngineManager();
  return g.instance;
}

export async function ensureGoEngineStarted() {
  if (!isGoEngineEnabled()) return null;
  const mgr = getGoEngineManager();
  await mgr.ensureDesiredWorkerCount();
  if (mgr.autostartSuppressed) return null;
  if (mgr.state === ENGINE_STATES.RUNNING || mgr.state === ENGINE_STATES.PAUSED) return mgr;
  if (mgr.state === ENGINE_STATES.STARTING && g.bootPromise) return g.bootPromise;
  if (g.bootPromise) return g.bootPromise;
  g.bootPromise = mgr.start().finally(() => { g.bootPromise = null; });
  return g.bootPromise;
}

/** Graceful shutdown for application/container lifecycle (not manual user stop). */
export async function shutdownGoEngine() {
  if (!isGoEngineEnabled()) return null;
  const mgr = getGoEngineManager();
  if (mgr.state === ENGINE_STATES.STOPPED && !mgr.workerManager) return mgr.getStatus();
  if (g.shutdownPromise) return g.shutdownPromise;
  g.shutdownPromise = mgr.stop({ manual: false }).finally(() => { g.shutdownPromise = null; });
  return g.shutdownPromise;
}

export async function getGoWorkerManager() {
  if (!isGoEngineEnabled()) return null;
  const mgr = await ensureGoEngineStarted();
  return mgr?.workerManager ?? null;
}

// Public facade re-exports — single ownership in workerManager.js
export {
  isGoEngineEnabled,
  isGoEngineExplicitlyDisabled,
  resolveWorkerBinary,
  computeWorkerIndex,
  GoWorkerManager,
} from "./workerManager.js";
