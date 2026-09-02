import { buildProxyOptionsFromCredentials, enrichProxyOptions } from "@/lib/network/connectionProxy.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";

export function resolveModalityProxyOptions(credentials, context = {}) {
  return enrichProxyOptions(buildProxyOptionsFromCredentials(credentials || {}), {
    providerId: context.providerId || context.provider || credentials?.provider,
    connectionId: context.connectionId || credentials?.connectionId,
  });
}

export async function modalityFetch(url, options, credentials, context = {}) {
  return proxyAwareFetch(url, options, resolveModalityProxyOptions(credentials, context));
}
