import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "@/shared/constants/product.js";

/**
 * Zustand-compatible storage with one-time legacy key migration.
 */
export function createMigratingStorage(storageKeys = STORAGE_KEYS, legacyMap = LEGACY_STORAGE_KEYS) {
  return {
    getItem: (name) => {
      if (typeof window === "undefined") return null;
      const direct = window.localStorage.getItem(name);
      if (direct != null) return direct;

      const legacyKeys = legacyMap.theme && name === storageKeys.theme
        ? legacyMap.theme
        : Object.values(legacyMap).flat();

      for (const legacyKey of legacyKeys) {
        const legacy = window.localStorage.getItem(legacyKey);
        if (legacy != null) {
          window.localStorage.setItem(name, legacy);
          try { window.localStorage.removeItem(legacyKey); } catch { /* ignore */ }
          return legacy;
        }
      }
      return null;
    },
    setItem: (name, value) => {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(name, value);
    },
    removeItem: (name) => {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(name);
    },
  };
}
