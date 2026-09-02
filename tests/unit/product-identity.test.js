/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PRODUCT,
  PRODUCT_ID,
  PRODUCT_HEADERS,
  STORAGE_KEYS,
  LEGACY_STORAGE_KEYS,
  LEGACY_ATTRIBUTION,
  normalizeBackupProduct,
  resolveSamlIssuer,
  getAppVersion,
} from "../../src/shared/constants/product.js";
import { wrapBackupExport, unwrapBackupImport } from "../../src/lib/db/backupFormat.js";
import {
  CANONICAL_APP_NAME,
  LEGACY_APP_NAME,
  getCanonicalDataDir,
  getLegacyDataDir,
} from "../../src/lib/dataDir.js";
import { getRuntimeGlobalStore, clearRuntimeGlobalStoreForTests } from "../../open-sse/shared/runtimeGlobals.js";
import { TOKEN_SAVER_HEADER, LEGACY_TOKEN_SAVER_HEADER } from "../../open-sse/config/runtimeConfig.js";
import { UPDATER_CONFIG } from "../../src/shared/constants/config.js";
import { ENV_KEYS, ACCEPTED_LEGACY_ENV_ALIASES } from "../../src/shared/constants/env.js";

describe("product identity SSOT", () => {
  it("exposes canonical HAI-Router identity", () => {
    expect(PRODUCT.id).toBe("hairouter");
    expect(PRODUCT.displayName).toBe("HAI-Router");
    expect(PRODUCT.dataDirName).toBe("hairouter");
    expect(PRODUCT.samlIssuerDefault).toBe("urn:hairouter:sp");
    expect(PRODUCT_ID).toBe("hairouter");
  });

  it("exposes HAI-Router init version (not upstream 9Router base)", () => {
    expect(getAppVersion()).toBe("0.1.0-init");
    expect(PRODUCT.version).toBe("0.1.0-init");
    expect(getAppVersion()).not.toBe(LEGACY_ATTRIBUTION.version);
  });

  it("records upstream fork version for footer attribution", () => {
    expect(LEGACY_ATTRIBUTION.version).toBe("0.5.59");
  });

  it("resolves SAML issuer with canonical default", () => {
    expect(resolveSamlIssuer("")).toBe("urn:hairouter:sp");
    expect(resolveSamlIssuer("urn:custom:sp")).toBe("urn:custom:sp");
  });
});

describe("storage key migration (clientStorage pattern)", () => {
  const storage = {};

  beforeEach(() => {
    global.window = {
      localStorage: {
        getItem: (k) => (k in storage ? storage[k] : null),
        setItem: (k, v) => { storage[k] = v; },
        removeItem: (k) => { delete storage[k]; },
      },
    };
    for (const k of Object.keys(storage)) delete storage[k];
  });

  afterEach(() => {
    delete global.window;
  });

  it("migrates legacy theme key to canonical", async () => {
    storage[LEGACY_STORAGE_KEYS.theme[1]] = JSON.stringify({ state: { theme: "dark" } });
    const { createMigratingStorage } = await import("../../src/shared/utils/clientStorage.js");
    const mig = createMigratingStorage();
    const raw = mig.getItem(STORAGE_KEYS.theme);
    expect(raw).toContain("dark");
    expect(storage[STORAGE_KEYS.theme]).toBeTruthy();
    expect(storage[LEGACY_STORAGE_KEYS.theme[1]]).toBeUndefined();
  });

  it("prefers canonical when both exist", async () => {
    storage[STORAGE_KEYS.theme] = JSON.stringify({ state: { theme: "light" } });
    storage["9router-theme"] = JSON.stringify({ state: { theme: "dark" } });
    const { createMigratingStorage } = await import("../../src/shared/utils/clientStorage.js");
    const mig = createMigratingStorage();
    const raw = mig.getItem(STORAGE_KEYS.theme);
    expect(raw).toContain("light");
  });
});

describe("runtime global migration", () => {
  afterEach(() => {
    clearRuntimeGlobalStoreForTests("usageStore");
  });

  it("reads legacy global once into canonical namespace", () => {
    globalThis.__9routerUsageStore = { legacy: true };
    const store = getRuntimeGlobalStore("usageStore");
    expect(store).toBe(globalThis.__9routerUsageStore);
    expect(globalThis.__haiRouterUsageStore).toBe(store);
  });

  it("rerun does not duplicate stores", () => {
    globalThis.__9routerUsageStore = { count: 1 };
    getRuntimeGlobalStore("usageStore");
    getRuntimeGlobalStore("usageStore");
    expect(globalThis.__haiRouterUsageStore.count).toBe(1);
  });
});

describe("backup identity", () => {
  it("exports canonical product id", () => {
    const wrapped = wrapBackupExport({ settings: { cloudEnabled: false } });
    expect(wrapped.product).toBe("hairouter");
  });

  it("imports legacy 9router backup as read-only compat", () => {
    const legacy = {
      product: "9router",
      settings: { cloudEnabled: true },
      providerConnections: [],
    };
    const { meta } = unwrapBackupImport(legacy);
    expect(meta.legacy).toBe(true);
    expect(meta.product).toBe("9router");
  });

  it("normalizeBackupProduct detects legacy", () => {
    expect(normalizeBackupProduct({ product: "9router" }).legacy).toBe(true);
    expect(normalizeBackupProduct({ product: "hairouter" }).legacy).toBe(false);
  });
});

describe("data directory identity", () => {
  it("uses canonical dir name hairouter", () => {
    expect(CANONICAL_APP_NAME).toBe("hairouter");
    expect(LEGACY_APP_NAME).toBe("9router");
    expect(getCanonicalDataDir()).toMatch(/hairouter$/);
    expect(getLegacyDataDir()).toMatch(/9router$/);
  });
});

describe("updater identity", () => {
  it("does not point at vanilla 9router npm package", () => {
    expect(UPDATER_CONFIG.npmPackageName).not.toMatch(/^9router@/);
    expect(UPDATER_CONFIG.npmPackageName.toLowerCase()).toMatch(/hairouter|hai-router-core/);
  });
});

describe("HTTP headers", () => {
  it("uses canonical token saver header with legacy alias", () => {
    expect(TOKEN_SAVER_HEADER).toBe("x-hai-router-token-saver");
    expect(LEGACY_TOKEN_SAVER_HEADER).toBe("x-9router-token-saver");
  });

  it("uses canonical connection id header constant", () => {
    expect(PRODUCT_HEADERS.connectionId).toBe("x-hai-router-connection-id");
  });
});

describe("env keys", () => {
  it("documents canonical HAI_ROUTER env names", () => {
    expect(ENV_KEYS.dataDir).toBe("HAI_ROUTER_DATA_DIR");
    expect(ACCEPTED_LEGACY_ENV_ALIASES[0].legacy).toContain("DATA_DIR");
  });
});

describe("env data directory migration", () => {
  let tmp;
  let legacyDir;
  let canonicalDir;
  let prevEnv;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hairouter-env-"));
    legacyDir = path.join(tmp, "9router");
    canonicalDir = path.join(tmp, "hairouter");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "probe.txt"), "legacy-ok", "utf8");
    prevEnv = { ...process.env };
    delete require.cache[require.resolve("../../src/lib/dataDirCore.cjs")];
  });

  afterEach(() => {
    process.env = prevEnv;
    delete require.cache[require.resolve("../../src/lib/dataDirCore.cjs")];
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("migrates legacy DATA_DIR env path to canonical hairouter path", () => {
    process.env.DATA_DIR = legacyDir;
    delete process.env.HAI_ROUTER_DATA_DIR;
    const core = require("../../src/lib/dataDirCore.cjs");
    const resolved = core.getDataDir();
    expect(resolved).toBe(canonicalDir);
    expect(fs.readFileSync(path.join(canonicalDir, "probe.txt"), "utf8")).toBe("legacy-ok");
    expect(fs.existsSync(path.join(legacyDir, ".migrated-to-hairouter"))).toBe(true);
  });

  it("prefers HAI_ROUTER_DATA_DIR over legacy DATA_DIR", () => {
    fs.mkdirSync(canonicalDir, { recursive: true });
    fs.writeFileSync(path.join(canonicalDir, "probe.txt"), "canonical-ok", "utf8");
    process.env.HAI_ROUTER_DATA_DIR = canonicalDir;
    process.env.DATA_DIR = legacyDir;
    const core = require("../../src/lib/dataDirCore.cjs");
    expect(core.getDataDir()).toBe(canonicalDir);
  });
});

describe("data dir migration idempotency", () => {
  let tmp;
  let canonical;
  let legacy;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hairouter-id-"));
    canonical = path.join(tmp, "canonical");
    legacy = path.join(tmp, "legacy");
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, "probe.txt"), "ok", "utf8");
  });

  afterEach(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("copy migration preserves canonical data when marker present", () => {
    fs.cpSync(legacy, canonical, { recursive: true });
    fs.writeFileSync(path.join(legacy, ".migrated-to-hairouter"), new Date().toISOString(), "utf8");
    expect(fs.readFileSync(path.join(canonical, "probe.txt"), "utf8")).toBe("ok");
    fs.writeFileSync(path.join(canonical, "probe.txt"), "still-ok", "utf8");
    fs.cpSync(legacy, canonical, { recursive: true, force: false });
    expect(fs.readFileSync(path.join(canonical, "probe.txt"), "utf8")).toBe("still-ok");
  });
});
