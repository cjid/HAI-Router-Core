import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";

/**
 * Providers with explicit model-list config in /api/providers/[id]/models.
 * Keep in sync with PROVIDER_MODELS_CONFIG keys in that route.
 */
export const BUILTIN_MODEL_LIST_PROVIDERS = new Set([
  "claude", "gemini", "codex", "antigravity", "github", "openai", "openrouter", "anthropic",
  "alicode", "alicode-intl", "alims-intl", "volcengine-ark", "byteplus", "deepseek", "groq", "xai",
  "mistral", "perplexity", "perplexity-agent", "together", "fireworks", "cerebras", "cohere",
  "nebius", "siliconflow", "hyperbolic", "ollama", "nanobanana", "chutes", "nvidia", "assemblyai",
  "vercel-ai-gateway", "kimchi", "cursor", "kiro", "qoder", "gemini-cli", "grok-cli", "ollama-local",
]);

export function supportsModelListForConnection(connection) {
  if (!connection?.provider) return false;
  const providerId = connection.provider;
  if (isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId)) {
    return Boolean(String(connection.providerSpecificData?.baseUrl || "").trim());
  }
  return BUILTIN_MODEL_LIST_PROVIDERS.has(providerId);
}

export function supportsModelListForProvider(providerId, { isCompatible = false, hasBaseUrl = false } = {}) {
  if (isCompatible && hasBaseUrl) return true;
  return BUILTIN_MODEL_LIST_PROVIDERS.has(providerId);
}
