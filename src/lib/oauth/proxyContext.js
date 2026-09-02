import { AsyncLocalStorage } from "node:async_hooks";

const oauthProxyStore = new AsyncLocalStorage();

export function runWithOAuthProxy(proxyOptions, fn) {
  return oauthProxyStore.run(proxyOptions || null, fn);
}

export function getOAuthProxyOptions() {
  return oauthProxyStore.getStore() || null;
}
