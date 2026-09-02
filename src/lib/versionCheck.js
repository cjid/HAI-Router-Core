import https from "https";
import { getAppVersion } from "@/shared/constants/product.js";
import { UPDATER_CONFIG } from "@/shared/constants/config";
import { PRODUCT_DISPLAY_NAME } from "@/shared/constants/product.js";

const VERSION_CACHE_TTL_MS = 3600000;

const cache = (global.__haiVersionCache ??= {
  distribution: { value: null, fetchedAt: 0 },
});

function fetchJson(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        resolve(null);
        return;
      }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

export function compareVersions(a, b) {
  if (!a || !b) return 0;
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const av = pa[i] || 0;
    const bv = pb[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

async function getCached(key, fetcher) {
  const entry = cache[key];
  if (entry.value && Date.now() - entry.fetchedAt < VERSION_CACHE_TTL_MS) {
    return entry.value;
  }
  const value = await fetcher();
  if (value) {
    entry.value = value;
    entry.fetchedAt = Date.now();
  }
  return value;
}

/** Latest published HAI-Router build (GitHub distribution). */
export async function fetchDistributionVersion() {
  const { githubOwner, githubRepo, githubBranch, githubPackagePath } = UPDATER_CONFIG;
  const base = `https://raw.githubusercontent.com/${githubOwner}/${githubRepo}/${githubBranch}`;
  const path = githubPackagePath ? `${githubPackagePath}/package.json` : "package.json";
  const json = await fetchJson(`${base}/${path}`);
  return json?.version || null;
}

/** @deprecated Legacy upstream check — intentionally disabled for HAI-Router product updates. */
export async function fetchUpstreamNpmVersion() {
  return null;
}

export async function getVersionStatus() {
  console.info("[UPDATER] update_check_started");
  const currentVersion = getAppVersion();
  const latestVersion = await getCached("distribution", fetchDistributionVersion);

  const hasUpdate = latestVersion
    ? compareVersions(latestVersion, currentVersion) > 0
    : false;

  if (latestVersion) {
    console.info("[UPDATER] update_check_succeeded latest=", latestVersion);
  } else {
    console.info("[UPDATER] update_check_succeeded latest=unavailable");
  }

  return {
    productName: PRODUCT_DISPLAY_NAME,
    currentVersion,
    latestVersion,
    hasUpdate,
    updateAvailable: hasUpdate,
    distributionSource: `${UPDATER_CONFIG.githubOwner}/${UPDATER_CONFIG.githubRepo}`,
    installPackage: UPDATER_CONFIG.npmPackageName,
    installCmd: UPDATER_CONFIG.installCmdLatest,
  };
}
