import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAdminNavItems } from "./useAdminNavItems";

describe("useAdminNavItems", () => {
  it("shows all items for a full admin (including plugin-backed items when plugins are active)", () => {
    const { result } = renderHook(() =>
      useAdminNavItems(true, false, false, false, ["data_import", "ticket_kpi"])
    );
    const labels = result.current.map((i) => i.label);
    expect(labels).toContain("Data Import");
    expect(labels).toContain("Ticket KPI");
    expect(labels).toContain("Users");
    expect(labels).toContain("Dashboard");
  });

  it("hides plugin-backed items when their plugin is NOT active", () => {
    const { result } = renderHook(() => useAdminNavItems(true, false, false, false, []));
    const labels = result.current.map((i) => i.label);
    expect(labels).not.toContain("Data Import");
    expect(labels).not.toContain("Ticket KPI");
    // Non-plugin items are still visible
    expect(labels).toContain("Users");
    expect(labels).toContain("Dashboard");
  });

  it("hides plugin-backed items when only a different plugin is active", () => {
    const { result } = renderHook(() => useAdminNavItems(true, false, false, false, ["analytics"]));
    const labels = result.current.map((i) => i.label);
    expect(labels).not.toContain("Data Import");
    expect(labels).not.toContain("Ticket KPI");
  });

  it("shows plugin-backed items when their specific plugin is active", () => {
    const { result } = renderHook(() =>
      useAdminNavItems(true, false, false, false, ["data_import"])
    );
    const labels = result.current.map((i) => i.label);
    expect(labels).toContain("Data Import");
    expect(labels).not.toContain("Ticket KPI");
  });

  it("hides fullAdminOnly items from CR-only admins", () => {
    const { result } = renderHook(() =>
      useAdminNavItems(false, false, false, true, ["data_import", "ticket_kpi"])
    );
    const labels = result.current.map((i) => i.label);
    expect(labels).not.toContain("Data Import");
    expect(labels).not.toContain("Ticket KPI");
    expect(labels).not.toContain("Dashboard");
    // Users is the only non-fullAdminOnly item
    expect(labels).toContain("Users");
  });

  it("shows Skills Catalog to HR when the Skills plugin is active", () => {
    const { result } = renderHook(() => useAdminNavItems(false, true, false, false, ["skills"]));
    expect(result.current.map((item) => item.label)).toContain("Skills Catalog");
    expect(result.current.find((item) => item.label === "Skills Catalog")?.group).toBe("People");
  });

  it("hides Skills Catalog from regular users and inactive plugins", () => {
    const { result } = renderHook(() => useAdminNavItems(false, false, false, false, []));
    expect(result.current.map((item) => item.label)).not.toContain("Skills Catalog");
  });
});
