/**
 * Pure route → skeleton id resolver (no JSX — safe for unit tests).
 * @param {string} pathname
 * @returns {string}
 */
export function matchRouteSkeletonId(pathname) {
  if (!pathname) return "generic";
  const normalized = pathname.replace(/\/$/, "") || "/dashboard";

  if (/^\/dashboard\/cli-tools\/[^/]+/.test(normalized)) return "cli-tool-detail";
  if (normalized === "/dashboard/cli-tools") return "cli-tools";
  if (/^\/dashboard\/providers\/[^/]+/.test(normalized)) return "provider-detail";
  if (normalized === "/dashboard/providers" || normalized.startsWith("/dashboard/providers/")) {
    return "providers";
  }
  if (normalized.startsWith("/dashboard/proxy-pools")) return "proxy-pools";
  if (normalized.startsWith("/dashboard/go-engine")) return "go-engine";
  if (normalized.startsWith("/dashboard/profile")) return "settings";
  if (normalized === "/dashboard" || normalized.startsWith("/dashboard/endpoint")) return "endpoint";
  if (normalized.startsWith("/dashboard/combos")) return "combos";
  if (normalized.startsWith("/dashboard/usage")) return "usage";
  if (normalized.startsWith("/dashboard/quota")) return "quota";
  if (normalized.startsWith("/dashboard/media-providers")) return "combos";
  return "generic";
}
