import { createHash, randomBytes } from "crypto";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseWorkerLogLine } from "./goEngineLogger.js";
import {
  MAX_WORKER_COUNT,
  MIN_WORKER_COUNT,
  WORKER_LIFECYCLE,
  isGoEngineEnabled,
  isGoEngineExplicitlyDisabled,
  parseWorkerId,
} from "./constants.js";

export {
  MAX_WORKER_COUNT,
  MIN_WORKER_COUNT,
  WORKER_LIFECYCLE,
  isGoEngineEnabled,
  isGoEngineExplicitlyDisabled,
  parseWorkerId,
};

const READY_RE = /HAI_WORKER_READY addr=([^\s]+)/;
const DEFAULT_MAX_INFLIGHT = 256;
const STARTUP_TIMEOUT_MS = 15000;

function repoRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..");
}

export function resolveWorkerBinary() {
  if (process.env.HAI_GO_WORKER_PATH && existsSync(process.env.HAI_GO_WORKER_PATH)) {
    return process.env.HAI_GO_WORKER_PATH;
  }
  const root = repoRoot();
  const binDir = join(root, "go-engine", "bin");
  const hostCandidates = [
    process.platform === "win32" ? join(binDir, "hai-worker.exe") : join(binDir, "hai-worker"),
    join(binDir, `hai-worker-${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`),
    join(binDir, `hai-worker-${process.platform}-amd64${process.platform === "win32" ? ".exe" : ""}`),
  ];
  for (const candidate of hostCandidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Stable worker index for session/provider/egress affinity (exported for tests). */
export function computeWorkerIndex(sessionId, providerId, workerCount, egressMode = "") {
  const count = Math.max(1, Number(workerCount) || 1);
  const key = `${sessionId || ""}|${providerId || ""}|${egressMode || "direct"}`;
  const hash = createHash("sha256").update(key).digest();
  return hash[0] % count;
}

function stableWorkerPick(sessionId, providerId, egressMode, workerCount) {
  return computeWorkerIndex(sessionId, providerId, workerCount, egressMode);
}

export class GoWorkerManager {
  constructor({ onWorkerLog = null, onWorkerExit = null } = {}) {
    this.workers = [];
    this.nextWorkerIndex = 0;
    this.authToken = randomBytes(32).toString("hex");
    this.onWorkerLog = onWorkerLog;
    this.onWorkerExit = onWorkerExit;
    this.startedAt = null;
  }

  getAssignableWorkers() {
    return this.workers.filter((w) => w.lifecycle === WORKER_LIFECYCLE.READY);
  }

  findWorker(index) {
    return this.workers.find((w) => w.index === index) || null;
  }

  async startInitial(count) {
    if (this.workers.length > 0) return this.workers;
    const n = Math.max(MIN_WORKER_COUNT, Math.min(MAX_WORKER_COUNT, Number(count) || MIN_WORKER_COUNT));
    const binary = resolveWorkerBinary();
    if (!binary) {
      throw new Error("Go worker binary not found (set HAI_GO_WORKER_PATH or build go-engine/bin/hai-worker)");
    }

    const starts = [];
    for (let i = 0; i < n; i += 1) {
      const index = this.nextWorkerIndex;
      this.nextWorkerIndex += 1;
      starts.push(this._spawnReady(binary, index));
    }
    this.workers = await Promise.all(starts);
    this.startedAt = Date.now();
    return this.workers;
  }

  /** @deprecated use startInitial */
  async start(workerCount = 1) {
    return this.startInitial(workerCount);
  }

  async _spawnReady(binary, index) {
    const worker = await this._spawnOne(binary, index);
    worker.lifecycle = WORKER_LIFECYCLE.READY;
    return worker;
  }

  async addOneWorker() {
    const binary = resolveWorkerBinary();
    if (!binary) {
      throw new Error("Go worker binary not found (set HAI_GO_WORKER_PATH or build go-engine/bin/hai-worker)");
    }
    const index = this.nextWorkerIndex;
    this.nextWorkerIndex += 1;
    const worker = await this._spawnReady(binary, index);
    this.workers.push(worker);
    return worker;
  }

  markDraining(index) {
    const worker = this.findWorker(index);
    if (!worker) return null;
    worker.lifecycle = WORKER_LIFECYCLE.DRAINING;
    return worker;
  }

  restoreReady(index) {
    const worker = this.findWorker(index);
    if (!worker) return null;
    worker.lifecycle = WORKER_LIFECYCLE.READY;
    return worker;
  }

  async terminateWorker(index) {
    const worker = this.findWorker(index);
    if (!worker) return false;
    worker.lifecycle = WORKER_LIFECYCLE.STOPPING;
    try { worker.child.kill("SIGTERM"); } catch { /* ignore */ }
    this.workers = this.workers.filter((w) => w.index !== index);
    return true;
  }

  removeWorkerByIndex(index) {
    this.workers = this.workers.filter((w) => w.index !== index);
  }

  _spawnOne(binary, index) {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        HAI_WORKER_AUTH_TOKEN: this.authToken,
        HAI_WORKER_HOST: "127.0.0.1",
        HAI_WORKER_PORT: "0",
        HAI_WORKER_MAX_INFLIGHT: String(process.env.HAI_GO_WORKER_MAX_INFLIGHT || DEFAULT_MAX_INFLIGHT),
      };

      const child = spawn(binary, [], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill(); } catch { /* ignore */ }
        reject(new Error(`Go worker ${index} startup timeout`));
      }, STARTUP_TIMEOUT_MS);

      const emitLine = (line) => {
        if (!line.trim()) return;
        if (this.onWorkerLog) this.onWorkerLog(index, line.trim());
        else parseWorkerLogLine(line.trim(), index);
      };

      const onLine = (line) => {
        const m = READY_RE.exec(line);
        if (m && !settled) {
          settled = true;
          clearTimeout(timer);
          const addr = m[1];
          resolve({
            index,
            addr,
            baseUrl: `http://${addr}`,
            child,
            authToken: this.authToken,
            startedAt: Date.now(),
            lifecycle: WORKER_LIFECYCLE.STARTING,
          });
          return;
        }
        emitLine(line);
      };

      child.stdout.on("data", (buf) => {
        for (const line of String(buf).split(/\r?\n/)) {
          if (line.trim()) onLine(line.trim());
        }
      });

      child.stderr.on("data", (buf) => {
        for (const line of String(buf).split(/\r?\n/)) {
          if (line.trim()) onLine(line.trim());
        }
      });

      child.on("exit", (code, signal) => {
        if (this.onWorkerExit) this.onWorkerExit(index, code, signal);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Go worker ${index} exited before ready (code=${code} signal=${signal || ""})`));
      });
    });
  }

  pickWorker({ sessionId, providerId, connectionId, egressMode = "direct", loadByWorkerId = null } = {}) {
    const assignable = this.getAssignableWorkers();
    if (!assignable.length) return null;

    const affinityKey = sessionId || connectionId || "";
    const preferredSlot = stableWorkerPick(affinityKey, providerId, egressMode, assignable.length);

    if (!loadByWorkerId || loadByWorkerId.size === 0) {
      return assignable[preferredSlot];
    }

    const loads = assignable.map((w) => {
      const id = `worker-${w.index}`;
      return { worker: w, id, load: loadByWorkerId.get(id) || 0 };
    });
    const preferredWorker = assignable[preferredSlot];
    const preferredLoad = loadByWorkerId.get(`worker-${preferredWorker.index}`) || 0;
    const minLoad = Math.min(...loads.map((l) => l.load));

    if (preferredLoad <= minLoad + 1) return preferredWorker;
    return loads.sort((a, b) => a.load - b.load)[0].worker;
  }

  async shutdown() {
    for (const w of this.workers) {
      w.lifecycle = WORKER_LIFECYCLE.STOPPING;
      try { w.child.kill("SIGTERM"); } catch { /* ignore */ }
    }
    this.workers = [];
    this.startedAt = null;
  }
}
