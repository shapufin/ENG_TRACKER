import { describe, it, expect } from "vitest";
import { resolveAdminCrumbs } from "./adminBreadcrumbs";
import { allAdminNavItems } from "./hooks/useAdminNavItems";

const r = (p: string) => resolveAdminCrumbs(p, allAdminNavItems);

describe("resolveAdminCrumbs", () => {
  it("resolves exact dashboard", () => {
    expect(r("/admin")).toEqual([{ label: "Overview" }, { label: "Dashboard" }]);
  });
  it("does not treat /admin as prefix for unknown routes", () => {
    expect(r("/admin/unknown")).toEqual([]);
  });
  it("resolves a plain page", () => {
    expect(r("/admin/users")).toEqual([{ label: "People" }, { label: "Users" }]);
  });
  it("adds link and Details for deeper routes", () => {
    expect(r("/admin/payroll/runs/7")).toEqual([
      { label: "Payroll" },
      { label: "Payrolls", to: "/admin/payroll/runs" },
      { label: "Details" },
    ]);
    expect(r("/admin/resource-access/3")).toEqual([
      { label: "Governance" },
      { label: "Resource Access", to: "/admin/resource-access" },
      { label: "Details" },
    ]);
  });
  it("covers payroll pages", () => {
    for (const p of ["wages", "calendar", "settings"]) {
      expect(r(`/admin/payroll/${p}`)[0]).toEqual({ label: "Payroll" });
    }
  });
  it("resolves ticket kpi mappings", () => {
    expect(r("/admin/ticket-kpi/mappings")).toEqual([{ label: "Tools" }, { label: "Ticket KPI" }]);
  });
  it("falls back to plugin crumbs", () => {
    expect(r("/admin/audit-logs")).toEqual([{ label: "System" }, { label: "Audit Logs" }]);
    expect(r("/admin/control-room/access")).toEqual([
      { label: "Extensions" },
      { label: "Control Room", to: "/admin/control-room" },
      { label: "Details" },
    ]);
  });
});
