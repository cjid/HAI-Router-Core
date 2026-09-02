import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { getOAuthProxyOptions } from "./proxyContext.js";

/** OAuth-scoped fetch — uses egress proxy from AsyncLocalStorage when set. */
export async function oauthFetch(url, options = {}) {
  return proxyAwareFetch(url, options, getOAuthProxyOptions());
}
