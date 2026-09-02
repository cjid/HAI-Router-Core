/** Token field readers for requestDetails rows — keep in sync with usageHistory conventions. */

export function getCachedTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return 0;
  return Number(
    tokens.cached_tokens
    ?? tokens.cache_read_input_tokens
    ?? tokens.prompt_tokens_details?.cached_tokens
    ?? 0
  ) || 0;
}

export function getCacheCreationTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return 0;
  return Number(
    tokens.cache_creation_input_tokens
    ?? tokens.prompt_tokens_details?.cache_creation_tokens
    ?? 0
  ) || 0;
}

export function getInputTokens(tokens) {
  const prompt = Number(tokens?.prompt_tokens ?? tokens?.input_tokens ?? 0) || 0;
  const cache = getCachedTokens(tokens);
  return prompt < cache ? cache : prompt;
}
