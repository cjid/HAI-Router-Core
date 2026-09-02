/** @typedef {"tool_call" | "message" | "reasoning" | "length" | "filtered" | "error" | "unknown"} LlmTurnType */

export const LLM_TURN_LABELS = {
  tool_call: "Tool Call",
  message: "Message",
  reasoning: "Reasoning",
  length: "Max Tokens",
  filtered: "Filtered",
  error: "Error",
  unknown: "Unknown",
};

export const LLM_TURN_BADGE_CLASS = {
  tool_call: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  message: "bg-primary/10 text-primary",
  reasoning: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  length: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  filtered: "bg-error/10 text-error",
  error: "bg-error/15 text-error",
  unknown: "bg-bg-subtle text-text-muted",
};

/**
 * Classify assistant turn type from stream summary or response metadata.
 * @param {{
 *   finishReason?: string | null,
 *   hasToolCalls?: boolean,
 *   hasThinking?: boolean,
 *   hasContent?: boolean,
 *   status?: string,
 * }} input
 * @returns {LlmTurnType}
 */
export function classifyLlmTurnType(input = {}) {
  const status = String(input.status || "").toLowerCase();
  if (status === "error" || status === "failed") return "error";

  const finish = String(input.finishReason || "").toLowerCase();
  const hasToolCalls = !!input.hasToolCalls;
  const hasThinking = !!input.hasThinking;
  const hasContent = !!input.hasContent;

  if (hasToolCalls || finish === "tool_calls" || finish === "tool_use") return "tool_call";
  if (finish === "length" || finish === "max_tokens") return "length";
  if (
    finish === "content_filter"
    || finish === "safety"
    || finish === "blocklist"
    || finish === "prohibited_content"
    || finish === "recitation"
  ) {
    return "filtered";
  }
  if (hasThinking && !hasContent && !hasToolCalls) return "reasoning";
  if (hasContent || finish === "stop" || finish === "end_turn" || finish === "completed") return "message";
  return "unknown";
}

/** @param {string | null | undefined} turnType */
export function getLlmTurnLabel(turnType) {
  return LLM_TURN_LABELS[turnType] || LLM_TURN_LABELS.unknown;
}

/** @param {string | null | undefined} turnType */
export function getLlmTurnBadgeClass(turnType) {
  return LLM_TURN_BADGE_CLASS[turnType] || LLM_TURN_BADGE_CLASS.unknown;
}

/**
 * Derive turn type from stored request detail (historical rows).
 * @param {object} detail
 * @returns {LlmTurnType}
 */
export function classifyTurnFromRequestDetail(detail) {
  if (!detail || typeof detail !== "object") return "unknown";
  if (detail.turnType) return detail.turnType;

  const response = detail.response || {};
  const choice = detail.providerResponse?.choices?.[0]
    || (typeof detail.providerResponse === "object" ? detail.providerResponse?.choices?.[0] : null);

  const finishReason = response.finish_reason
    || response.finishReason
    || choice?.finish_reason
    || choice?.stop_reason
    || null;

  const message = choice?.message || response.message || {};
  const toolCalls = message.tool_calls
    || response.tool_calls
    || (Array.isArray(response.output)
      ? response.output.filter((item) => item?.type === "function_call" || item?.type === "custom_tool_call")
      : []);

  const hasToolCalls = Array.isArray(toolCalls) ? toolCalls.length > 0 : !!toolCalls;
  const content = typeof response.content === "string"
    ? response.content
    : (typeof message.content === "string" ? message.content : "");
  const thinking = response.thinking || message.reasoning_content || null;

  return classifyLlmTurnType({
    finishReason,
    hasToolCalls,
    hasThinking: !!thinking,
    hasContent: !!content && content !== "[Empty streaming response]" && content !== "[Streaming in progress...]",
    status: detail.status,
  });
}

/**
 * Derive turn type from OpenAI-style chat completion body.
 * @param {object} responseBody
 * @returns {LlmTurnType}
 */
export function classifyTurnFromChatCompletion(responseBody) {
  const choice = responseBody?.choices?.[0];
  if (!choice) return "unknown";
  const message = choice.message || {};
  const content = typeof message.content === "string" ? message.content : "";
  return classifyLlmTurnType({
    finishReason: choice.finish_reason,
    hasToolCalls: Array.isArray(message.tool_calls) && message.tool_calls.length > 0,
    hasThinking: !!message.reasoning_content,
    hasContent: content.length > 0,
  });
}
