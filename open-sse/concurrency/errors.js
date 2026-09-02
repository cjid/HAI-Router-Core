export class SchedulerOverloadError extends Error {
  constructor(message = "Server is at capacity. Try again later.") {
    super(message);
    this.name = "SchedulerOverloadError";
    this.status = 503;
    this.retryable = true;
  }
}

export class QueueTimeoutError extends Error {
  constructor(message = "Request timed out waiting for capacity.", meta = {}) {
    super(message);
    this.name = "QueueTimeoutError";
    this.status = 503;
    this.retryable = true;
    this.queueTimeoutMs = meta.queueTimeoutMs ?? null;
    this.laneName = meta.laneName ?? null;
    this.laneStats = meta.laneStats ?? null;
  }
}

export class RateLimitCooldownError extends Error {
  constructor(message = "Rate limited.", retryAfterMs = 0) {
    super(message);
    this.name = "RateLimitCooldownError";
    this.status = 429;
    this.retryAfterMs = retryAfterMs;
    this.retryable = true;
  }
}
