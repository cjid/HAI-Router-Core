import { getAdapter } from "../driver.js";
import { getProviderConnections } from "./connectionsRepo.js";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
} from "@/shared/constants/providers.js";

function rowToEnabled(row) {
  return row?.isEnabled === 1 || row?.isEnabled === true;
}

/** All persisted provider enable flags (providerId → boolean). */
export async function getProviderStatesMap() {
  const db = await getAdapter();
  const rows = db.all(`SELECT providerId, isEnabled FROM providerStates`);
  const map = {};
  for (const row of rows) {
    map[row.providerId] = rowToEnabled(row);
  }
  return map;
}

export async function setProviderEnabled(providerId, isEnabled) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO providerStates(providerId, isEnabled, updatedAt)
     VALUES(?, ?, ?)
     ON CONFLICT(providerId) DO UPDATE SET
       isEnabled = excluded.isEnabled,
       updatedAt = excluded.updatedAt`,
    [providerId, isEnabled ? 1 : 0, now],
  );
  return { providerId, isEnabled: !!isEnabled, updatedAt: now };
}

function isLlmProvider(info) {
  const kinds = info?.serviceKinds;
  if (!kinds) return true;
  return kinds.includes("llm");
}

function providerAuthTypes(info, providerId) {
  if (providerId === "kiro") return ["oauth", "apikey", "api_key"];
  const modes = info?.authModes;
  if (!Array.isArray(modes)) {
    if (providerId in FREE_TIER_PROVIDERS || providerId in APIKEY_PROVIDERS) {
      return ["oauth", "apikey", "api_key"];
    }
    return ["oauth"];
  }
  if (!modes.includes("apikey")) return ["oauth"];
  return ["oauth", "apikey", "api_key"];
}

function getEffectiveConnectionStatus(conn) {
  const isCooldown = Object.entries(conn).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now(),
  );
  return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
}

function hasLiveConnection(connections, providerId, authTypes) {
  const types = Array.isArray(authTypes) ? authTypes : [authTypes];
  const providerConnections = connections.filter(
    (c) => c.provider === providerId && types.includes(c.authType),
  );
  if (providerConnections.length === 0) return false;
  return providerConnections.some((c) => {
    if (c.isActive === false) return false;
    const status = getEffectiveConnectionStatus(c);
    return status === "active" || status === "success";
  });
}

/**
 * Count LLM providers that are enabled in providerStates and usable.
 * providerStates is authoritative when a row exists; noAuth defaults to enabled.
 */
export async function countActiveProviders() {
  const connections = await getProviderConnections();
  const states = await getProviderStatesMap();
  const catalogs = [FREE_PROVIDERS, FREE_TIER_PROVIDERS, OAUTH_PROVIDERS, APIKEY_PROVIDERS];
  let count = 0;

  for (const catalog of catalogs) {
    for (const [id, info] of Object.entries(catalog)) {
      if (info.hidden || !isLlmProvider(info)) continue;

      if (Object.prototype.hasOwnProperty.call(states, id) && states[id] === false) {
        continue;
      }

      if (info.noAuth) {
        count++;
        continue;
      }

      const authTypes = providerAuthTypes(info, id);
      if (hasLiveConnection(connections, id, authTypes)) count++;
    }
  }

  return count;
}
