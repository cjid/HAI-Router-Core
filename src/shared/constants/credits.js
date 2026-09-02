import { APP_CONFIG, GITHUB_CONFIG } from "./config.js";
import { BRANDING } from "./branding.js";
import { LEGACY_ATTRIBUTION, PRODUCT } from "./product.js";

/**
 * Credits & attribution copy — upstream 9Router first, then HAI-Router fork.
 * Single source for CreditsModal and any future attribution surfaces.
 */
export const CREDITS_INTRO =
  "HAI-Router stands on the shoulders of open-source work. We gratefully acknowledge the original 9Router project, its author, and every contributor who helped build the routing core this distribution extends.";

export const CREDITS_SECTIONS = Object.freeze([
  {
    key: "upstream",
    icon: "hub",
    title: `${LEGACY_ATTRIBUTION.name} — upstream foundation`,
    description: `${LEGACY_ATTRIBUTION.name} v${LEGACY_ATTRIBUTION.version} is the open-source AI routing gateway that HAI-Router is based on. Its provider integrations, translation layer, and dashboard patterns are the foundation of this product.`,
    people: Object.freeze([
      {
        name: "decolua",
        role: "Original author & maintainer",
        href: "https://github.com/decolua",
      },
    ]),
    links: Object.freeze([
      {
        label: `${LEGACY_ATTRIBUTION.name} repository`,
        href: LEGACY_ATTRIBUTION.repoUrl,
      },
      {
        label: "All upstream contributors",
        href: `${LEGACY_ATTRIBUTION.repoUrl}/graphs/contributors`,
      },
      {
        label: "Upstream issues & discussions",
        href: `${LEGACY_ATTRIBUTION.repoUrl}/issues`,
      },
      {
        label: "MIT License",
        href: `${LEGACY_ATTRIBUTION.repoUrl}/blob/main/LICENSE`,
      },
    ]),
  },
  {
    key: "hairouter",
    icon: "star",
    title: `${PRODUCT.displayName} — customized distribution`,
    description: `${APP_CONFIG.description}. This fork adds ${BRANDING.companyName} branding, UI refinements, and product-specific integrations while preserving compatibility with the upstream routing engine.`,
    people: Object.freeze([
      {
        name: BRANDING.companyName,
        role: "Customization & distribution",
        href: GITHUB_CONFIG.repoUrl,
      },
    ]),
    links: Object.freeze([
      {
        label: `${PRODUCT.displayName} repository`,
        href: GITHUB_CONFIG.repoUrl,
      },
      {
        label: "Changelog",
        href: `${GITHUB_CONFIG.repoUrl}/blob/master/CHANGELOG.md`,
      },
    ]),
  },
]);

export const CREDITS_FOOTNOTE = Object.freeze({
  license: "Licensed under MIT unless otherwise noted. Upstream copyrights remain with their respective authors.",
  versionLabel: `${PRODUCT.displayName} v${APP_CONFIG.version}`,
});
