import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";

/** Primary sidebar entries — shared with Header route resolution. */
export const DASHBOARD_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combo & Vision Adapter", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Quota Tracker", icon: "data_usage" },
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

/** Static route metadata (longest paths first for prefix matching). */
const STATIC_ROUTE_META = [
  {
    path: "/dashboard/usage",
    title: "Usage & Analytics",
    description: "Monitor your API usage, token consumption, and request logs",
    icon: "bar_chart",
  },
  {
    path: "/dashboard/providers",
    title: "Providers",
    description: "Manage your AI provider connections",
    icon: "dns",
  },
  {
    path: "/dashboard/combos",
    title: "Combos",
    description: "Model combos with fallback",
    icon: "layers",
  },
  {
    path: "/dashboard/quota",
    title: "Quota Tracker",
    description: "Track and manage your API quota limits",
    icon: "data_usage",
  },
  {
    path: "/dashboard/auth-files",
    title: "Auth Files",
    description: "Map provider credentials stored in the local database",
    icon: "vpn_key",
  },
  {
    path: "/dashboard/mitm",
    title: "MITM Proxy",
    description: "Intercept CLI tool traffic and route through HAI-Router",
    icon: "security",
  },
  {
    path: "/dashboard/token-saver",
    title: "Token Saver",
    description: "Compress prompts and outputs to save tokens",
    icon: "savings",
  },
  {
    path: "/dashboard/cli-tools",
    title: "CLI Tools",
    description: "Configure CLI tools",
    icon: "terminal",
  },
  {
    path: "/dashboard/go-engine",
    title: "Go Engine",
    description: "Provider transport worker lifecycle and health",
    icon: "memory",
  },
  {
    path: "/dashboard/proxy-pools",
    title: "Proxy Pools",
    description: "Manage your proxy pool configurations",
    icon: "lan",
  },
  {
    path: "/dashboard/skills",
    title: "Agent Skills",
    description: "Copy a link and paste to your AI to use HAI-Router — no install needed",
    icon: "extension",
  },
  {
    path: "/dashboard/profile",
    title: "Settings",
    description: "Manage your preferences",
    icon: "settings",
  },
  {
    path: "/dashboard/translator",
    title: "Translator",
    description: "Debug translation flow between formats",
    icon: "translate",
  },
  {
    path: "/dashboard/console-log",
    title: "Console Log",
    description: "Live server console output",
    icon: "monitor",
  },
  {
    path: "/dashboard",
    title: "Dashboard",
    description: "API endpoint configuration",
    icon: "dashboard",
    exact: true,
  },
];

function matchStaticRoute(pathname) {
  for (const route of STATIC_ROUTE_META) {
    if (route.exact) {
      if (pathname === route.path) return route;
      continue;
    }
    if (pathname === route.path || pathname.startsWith(`${route.path}/`)) {
      return route;
    }
  }
  return null;
}

/** Resolve header title/description/breadcrumbs from the current pathname. */
export function resolveDashboardPageMeta(pathname) {
  if (!pathname) return { title: "", description: "", breadcrumbs: [] };

  const mediaDetailMatch = pathname.match(/\/media-providers\/([^/]+)\/([^/]+)$/);
  if (mediaDetailMatch) {
    const kindId = mediaDetailMatch[1];
    const providerId = mediaDetailMatch[2];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    const provider = AI_PROVIDERS[providerId];
    return {
      title: provider?.name || providerId,
      description: "",
      breadcrumbs: [
        { label: "Media Providers", href: `/dashboard/media-providers/${kindId}` },
        { label: kindConfig?.label || kindId, href: `/dashboard/media-providers/${kindId}` },
        { label: provider?.name || providerId, image: getProviderIconSrc(providerId) },
      ],
    };
  }

  const mediaKindMatch = pathname.match(/\/media-providers\/([^/]+)$/);
  if (mediaKindMatch) {
    const kindId = mediaKindMatch[1];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    return {
      title: kindConfig?.label || kindId,
      description: `Manage your ${kindConfig?.label || kindId} providers`,
      icon: kindConfig?.icon || "perm_media",
      breadcrumbs: [],
    };
  }

  const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
  if (providerMatch && !pathname.includes("/media-providers")) {
    const providerId = providerMatch[1];
    const providerInfo = OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
    if (providerInfo) {
      return {
        title: providerInfo.name,
        description: "",
        breadcrumbs: [
          { label: "Providers", href: "/dashboard/providers" },
          { label: providerInfo.name, image: getProviderIconSrc(providerInfo.id) },
        ],
      };
    }
  }

  const staticRoute = matchStaticRoute(pathname);
  if (staticRoute) {
    return {
      title: staticRoute.title,
      description: staticRoute.description || "",
      icon: staticRoute.icon,
      breadcrumbs: [],
    };
  }

  return { title: "", description: "", breadcrumbs: [] };
}

/** Sidebar active-state helper — keeps menu highlight in sync with routes. */
export function isDashboardNavActive(pathname, href) {
  if (!pathname) return false;
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
