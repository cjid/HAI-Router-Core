/**
 * Counting semaphore with FIFO wait queue and abort/timeout support.
 */

import { SchedulerOverloadError, QueueTimeoutError } from "./errors.js";

export class Semaphore {
  constructor({ capacity, maxQueue = 0, queueTimeoutMs = 10_000, name = "sem" } = {}) {
    this.capacity = Math.max(1, capacity);
    this.maxQueue = Math.max(0, maxQueue);
    this.queueTimeoutMs = Math.max(0, queueTimeoutMs);
    this.name = name;
    this.active = 0;
    this.queue = [];
    /** @type {Map<string, number>} active slots per sessionId (fair dequeue) */
    this.sessionActive = new Map();
  }

  get stats() {
    return {
      name: this.name,
      capacity: this.capacity,
      active: this.active,
      queued: this.queue.length,
      maxQueue: this.maxQueue,
    };
  }

  async acquire({ signal = null, sessionId = null } = {}) {
    const sid = sessionId ? String(sessionId) : "";
    if (this.active < this.capacity) {
      this.active++;
      this._incSessionActive(sid);
      return this._makeRelease(sid);
    }

    if (this.maxQueue > 0 && this.queue.length >= this.maxQueue) {
      throw new SchedulerOverloadError();
    }

    return new Promise((resolve, reject) => {
      const entry = {
        resolve: null,
        reject,
        timer: null,
        onAbort: null,
        released: false,
        sessionId: sid,
      };

      entry.signal = signal;

      entry.onAbort = () => {
        if (entry.released) return;
        entry.released = true;
        this._dequeue(entry);
        reject(Object.assign(new Error("Request aborted"), { name: "AbortError" }));
      };

      if (signal?.aborted) {
        entry.onAbort();
        return;
      }
      signal?.addEventListener("abort", entry.onAbort, { once: true });

      entry.timer = setTimeout(() => {
        if (entry.released) return;
        entry.released = true;
        this._dequeue(entry);
        reject(new QueueTimeoutError(
          `Request timed out waiting for capacity on lane "${this.name}" after ${this.queueTimeoutMs}ms.`,
          { queueTimeoutMs: this.queueTimeoutMs, laneName: this.name, laneStats: this.stats },
        ));
      }, this.queueTimeoutMs);

      entry.resolve = () => {
        if (entry.released) return;
        entry.released = true;
        this._dequeue(entry);
        this.active++;
        this._incSessionActive(entry.sessionId);
        resolve(this._makeRelease(entry.sessionId));
      };

      this.queue.push(entry);
    });
  }

  _incSessionActive(sessionId) {
    if (!sessionId) return;
    this.sessionActive.set(sessionId, (this.sessionActive.get(sessionId) || 0) + 1);
  }

  _decSessionActive(sessionId) {
    if (!sessionId) return;
    const next = (this.sessionActive.get(sessionId) || 1) - 1;
    if (next <= 0) this.sessionActive.delete(sessionId);
    else this.sessionActive.set(sessionId, next);
  }

  /** Weighted-fair dequeue: prefer queued session with fewest active slots. */
  _pickFair() {
    if (!this.queue.length) return null;
    let bestIdx = 0;
    let bestLoad = Infinity;
    for (let i = 0; i < this.queue.length; i += 1) {
      const sid = this.queue[i].sessionId || "";
      const load = this.sessionActive.get(sid) || 0;
      if (load < bestLoad) {
        bestLoad = load;
        bestIdx = i;
      }
    }
    return this.queue.splice(bestIdx, 1)[0];
  }

  _dequeue(entry) {
    const idx = this.queue.indexOf(entry);
    if (idx >= 0) this.queue.splice(idx, 1);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort);
  }

  _makeRelease(sessionId = "") {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.active = Math.max(0, this.active - 1);
      this._decSessionActive(sessionId);
      const next = this._pickFair();
      if (next && !next.released) next.resolve();
    };
  }

  /** Update capacity without interrupting already-admitted requests. */
  setCapacity(nextCapacity) {
    this.capacity = Math.max(1, nextCapacity);
    while (this.active < this.capacity && this.queue.length) {
      const next = this._pickFair();
      if (next && !next.released) next.resolve();
    }
  }

  /** Test helper — drain queue with rejections */
  shutdown(rejectReason = new Error("Scheduler shutting down")) {
    while (this.queue.length) {
      const entry = this.queue.shift();
      if (entry.released) continue;
      entry.released = true;
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(rejectReason);
    }
  }
}
