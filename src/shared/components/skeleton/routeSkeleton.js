import { CliToolsSkeleton, CliToolDetailRouteSkeleton } from "./CliToolsSkeleton";
import { CombosSkeleton } from "./CombosSkeleton";
import { EndpointSkeleton } from "./EndpointSkeleton";
import { GenericPageSkeleton } from "./GenericPageSkeleton";
import { GoEnginePageSkeleton } from "./GoEnginePageSkeleton";
import { ProviderDetailSkeleton } from "./ProviderDetailSkeleton";
import { ProvidersSkeleton } from "./ProvidersSkeleton";
import { ProxyPoolsSkeleton } from "./ProxyPoolsSkeleton";
import { QuotaSkeleton, UsageSkeleton } from "./UsageSkeleton";
import { SettingsSkeleton } from "./SettingsSkeleton";
import { matchRouteSkeletonId } from "./routeSkeletonMap";

const SKELETON_BY_ID = {
  "cli-tools": CliToolsSkeleton,
  "cli-tool-detail": CliToolDetailRouteSkeleton,
  providers: ProvidersSkeleton,
  "provider-detail": ProviderDetailSkeleton,
  "proxy-pools": ProxyPoolsSkeleton,
  "go-engine": GoEnginePageSkeleton,
  settings: SettingsSkeleton,
  endpoint: EndpointSkeleton,
  combos: CombosSkeleton,
  usage: UsageSkeleton,
  quota: QuotaSkeleton,
  generic: GenericPageSkeleton,
};

/**
 * @param {string} pathname
 * @returns {import("react").ComponentType<{ className?: string }>}
 */
export function resolveRouteSkeleton(pathname) {
  const id = matchRouteSkeletonId(pathname);
  return SKELETON_BY_ID[id] ?? GenericPageSkeleton;
}

export {
  CliToolsSkeleton,
  CliToolDetailRouteSkeleton,
  ProvidersSkeleton,
  ProviderDetailSkeleton,
  ProxyPoolsSkeleton,
  SettingsSkeleton,
  EndpointSkeleton,
  CombosSkeleton,
  UsageSkeleton,
  QuotaSkeleton,
  GoEnginePageSkeleton,
  GenericPageSkeleton,
};

export { matchRouteSkeletonId } from "./routeSkeletonMap";
