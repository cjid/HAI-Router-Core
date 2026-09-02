/**
 * Single-flight poll scheduler — at most one poll in flight, recursive timeout (no overlap).
 */
export function createPollScheduler({ intervalMs = 3000, poll, isActive = () => true }) {
  let timer = null;
  let disposed = false;
  let inFlight = false;

  const scheduleNext = () => {
    if (disposed || !isActive()) return;
    timer = setTimeout(runPoll, intervalMs);
  };

  const runPoll = async () => {
    if (disposed || !isActive() || inFlight) {
      scheduleNext();
      return;
    }
    inFlight = true;
    try {
      await poll();
    } finally {
      inFlight = false;
      scheduleNext();
    }
  };

  return {
    start() {
      disposed = false;
      inFlight = false;
      scheduleNext();
    },
    stop() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    isInFlight: () => inFlight,
  };
}
