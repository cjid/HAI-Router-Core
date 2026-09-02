import { getUsageStats, statsEmitter, getActiveRequests } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d", "all"]);

/** Min gap between full recomputes for long-range periods (ms). */
const FULL_REFRESH_MIN_MS = {
  today: 0,
  "24h": 0,
  "7d": 15000,
  "30d": 30000,
  "60d": 30000,
  all: 30000,
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period") || "today";
  const period = VALID_PERIODS.has(periodParam) ? periodParam : "today";

  const encoder = new TextEncoder();
  const state = {
    closed: false,
    keepalive: null,
    activePoll: null,
    send: null,
    sendPending: null,
    lastFullAt: 0,
    period,
  };

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload) => {
        if (state.closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ period, ...payload })}\n\n`));
        } catch {
          teardown();
        }
      };

      const teardown = () => {
        if (state.closed) return;
        state.closed = true;
        statsEmitter.off("update", state.send);
        statsEmitter.off("pending", state.sendPending);
        clearInterval(state.keepalive);
        clearInterval(state.activePoll);
      };

      request.signal?.addEventListener("abort", teardown, { once: true });

      state.sendPending = async () => {
        if (state.closed) return;
        try {
          const { activeRequests, recentRequests, errorProvider, pending } = await getActiveRequests();
          emit({ kind: "live", activeRequests, recentRequests, errorProvider, pending });
        } catch {
          teardown();
        }
      };

      state.send = async () => {
        if (state.closed) return;
        const minGap = FULL_REFRESH_MIN_MS[state.period] ?? 0;
        if (state.lastFullAt && Date.now() - state.lastFullAt < minGap) {
          return state.sendPending();
        }
        try {
          await state.sendPending();
          const stats = await getUsageStats(state.period);
          state.lastFullAt = Date.now();
          emit({ kind: "full", ...stats });
        } catch {
          teardown();
        }
      };

      await state.send();

      statsEmitter.on("update", state.send);
      statsEmitter.on("pending", state.sendPending);

      state.activePoll = setInterval(() => {
        if (state.closed) { clearInterval(state.activePoll); return; }
        state.sendPending?.();
      }, 400);

      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          state.closed = true;
          clearInterval(state.keepalive);
        }
      }, 25000);
    },

    cancel() {
      state.closed = true;
      statsEmitter.off("update", state.send);
      statsEmitter.off("pending", state.sendPending);
      clearInterval(state.keepalive);
      clearInterval(state.activePoll);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
