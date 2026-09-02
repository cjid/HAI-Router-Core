import { describe, expect, it } from "vitest";
import {
  DASHBOARD_NAV_ITEMS,
  isDashboardNavActive,
  resolveDashboardPageMeta,
} from "../../src/shared/constants/dashboardRoutes.js";

describe("dashboard canonical route", () => {
  it("sidebar Dashboard item points to /dashboard", () => {
    expect(DASHBOARD_NAV_ITEMS[0]).toMatchObject({
      href: "/dashboard",
      label: "Dashboard",
    });
  });

  it("isDashboardNavActive highlights /dashboard and legacy /dashboard/endpoint", () => {
    expect(isDashboardNavActive("/dashboard", "/dashboard")).toBe(true);
    expect(isDashboardNavActive("/dashboard/endpoint", "/dashboard")).toBe(true);
    expect(isDashboardNavActive("/dashboard/providers", "/dashboard")).toBe(false);
  });

  it("resolveDashboardPageMeta for canonical /dashboard", () => {
    expect(resolveDashboardPageMeta("/dashboard")).toMatchObject({
      title: "Dashboard",
      description: "API endpoint configuration",
    });
  });
});
