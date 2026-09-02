/**
 * Redact provider identity and sensitive data from error text.
 */

const PROVIDER_PATTERNS = [
  /\bopenai\b/gi,
  /\banthropic\b/gi,
  /\bclaude\b/gi,
  /\bgemini\b/gi,
  /\bgoogle\b/gi,
  /\bcodex\b/gi,
  /\bxai\b/gi,
  /\bgrok\b/gi,
  /\bkiro\b/gi,
  /\bantigravity\b/gi,
  /\bperplexity\b/gi,
  /\bcursor\b/gi,
  /\bcommandcode\b/gi,
  /\b9router\b/gi,
  /\b9-router\b/gi,
];

const SENSITIVE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /\bAuthorization:\s*\S+/gi,
  /\bsk-[A-Za-z0-9]{10,}/gi,
  /\brefresh_token[=:]\s*\S+/gi,
  /\baccess_token[=:]\s*\S+/gi,
  /\bapi[_-]?key[=:]\s*\S+/gi,
  /\bclient_secret[=:]\s*\S+/gi,
  /\bproxy:\/\/[^\s]+/gi,
  /\bCookie:\s*[^\n]+/gi,
  /\bSet-Cookie:\s*[^\n]+/gi,
  /org_[A-Za-z0-9]+/g,
  /req_[A-Za-z0-9]{8,}/g,
  /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
  /\bhttps?:\/\/[^\s]+/gi,
];

const HOST_PATTERNS = [
  /\b[a-z0-9-]+\.(openai|anthropic|googleapis|google|x\.ai|cursor|github|amazonaws)\.[a-z.]+\b/gi,
];

export function redactSensitiveText(text) {
  if (text == null) return "";
  let out = String(text);
  for (const re of SENSITIVE_PATTERNS) out = out.replace(re, "[redacted]");
  for (const re of PROVIDER_PATTERNS) out = out.replace(re, "upstream");
  for (const re of HOST_PATTERNS) out = out.replace(re, "[host]");
  return out.replace(/\s{2,}/g, " ").trim();
}

export function stripProviderIdentity(text) {
  if (text == null) return "";
  let out = String(text);
  for (const re of PROVIDER_PATTERNS) out = out.replace(re, "upstream");
  for (const re of HOST_PATTERNS) out = out.replace(re, "[host]");
  return out.replace(/\s{2,}/g, " ").trim();
}

export function sanitizeUpstreamMessage(rawMessage, { maxLen = 512, stripProvider = true } = {}) {
  let redacted;
  if (stripProvider) {
    redacted = redactSensitiveText(rawMessage);
  } else {
    let out = String(rawMessage ?? "");
    for (const re of SENSITIVE_PATTERNS) out = out.replace(re, "[redacted]");
    redacted = out.replace(/\s{2,}/g, " ").trim();
  }
  if (!redacted) return "";
  return redacted.slice(0, maxLen);
}
