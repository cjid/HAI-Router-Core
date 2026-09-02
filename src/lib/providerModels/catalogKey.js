import crypto from "node:crypto";

/** Stable cache key — never includes secrets. */
export function buildCatalogKey({ providerId, connectionId, endpointIdentity }) {
  const provider = String(providerId || "").trim();
  const conn = String(connectionId || "_default").trim();
  const endpoint = String(endpointIdentity || provider).trim().toLowerCase();
  const hash = crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
  return `${provider}::${conn}::${hash}`;
}

export function resolveEndpointIdentity(connection) {
  if (!connection) return "";
  const psd = connection.providerSpecificData || {};
  return String(psd.baseUrl || psd.baseURL || connection.id || connection.provider || "").trim();
}
