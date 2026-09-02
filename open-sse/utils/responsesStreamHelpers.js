// Helpers for OpenAI Responses API streaming termination + event framing
import { FORMATS } from "../translator/formats.js";
import { formatSSE } from "./streamHelpers.js";
import { createInternalError, HAI_CODES } from "../errors/index.js";

// Responses API events that signal the stream has reached a terminal state
const OPENAI_RESPONSES_TERMINAL_EVENTS = new Set([
  "response.completed",
  "response.done",
  "response.failed",
  "error"
]);

export function getOpenAIResponsesEventName(eventName, chunk) {
  if (eventName) return eventName;
  if (chunk && typeof chunk.type === "string") return chunk.type;
  return null;
}

export function isOpenAIResponsesTerminalEvent(eventName, chunk) {
  const type = getOpenAIResponsesEventName(eventName, chunk);
  if (OPENAI_RESPONSES_TERMINAL_EVENTS.has(type)) return true;
  const status = chunk?.response?.status;
  return status === "completed" || status === "failed";
}

const sharedEncoder = new TextEncoder();

// Encoded response.failed + [DONE] payload for aborted/stalled Responses passthrough streams
export function buildAbortedResponsesTerminalBytes(errorCtx = null) {
  return sharedEncoder.encode(`${formatIncompleteOpenAIResponsesStreamFailure(errorCtx)}data: [DONE]\n\n`);
}

// Synthesize a response.failed event for streams that close without a terminal event
export function formatIncompleteOpenAIResponsesStreamFailure(errorCtx = null) {
  const internal = createInternalError({
    requestId: errorCtx?.requestId,
    statusCode: 502,
    haiCode: HAI_CODES.stream_error,
    phase: "stream",
    provider: errorCtx?.provider,
    connectionId: errorCtx?.connectionId,
    model: errorCtx?.model,
  });
  return formatSSE({
    event: "response.failed",
    data: {
      type: "response.failed",
      response: {
        id: internal.requestId,
        status: "failed",
        error: {
          type: "stream_error",
          code: internal.haiCode,
          message: "The stream ended unexpectedly.",
          request_id: internal.requestId,
        },
      },
    },
  }, FORMATS.OPENAI_RESPONSES);
}
