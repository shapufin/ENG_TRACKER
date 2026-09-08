import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVisibleNavItems } from "./useVisibleNavItems";

const labels = (result: ReturnType<typeof useVisibleNavItems>) => result.map((item) => item.label);

describe("useVisibleNavItems", () => {
  it("returns all items for a superuser", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, false, true));
    expect(result.current).toHaveLength(14);
  });

  it("returns only public items for an employee", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, true, false));
    const visible = labels(result.current);
    expect(visible).toContain("Overtime");
    expect(visible).toContain("Standby");
    expect(visible).not.toContain("Pending Approvals");
    expect(visible).not.toContain("HR Reports");
    expect(visible).not.toContain("Admin");
  });

  it("includes team leader items", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, true, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("Pending Approvals");
    expect(visible).toContain("Team Overview");
    expect(visible).toContain("Team Performance");
    expect(visible).toContain("Upload Management");
  });

  it("includes HR items", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, true, false, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("HR Reports");
    expect(visible).not.toContain("Pending Approvals");
  });

  it("includes admin items", () => {
    const { result } = renderHook(() => useVisibleNavItems(true, false, false, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("Admin");
    expect(visible).toContain("Plugins");
  });

  it("combines roles for a multi-role user", () => {
    const { result } = renderHook(() => useVisibleNavItems(true, true, true, true, false));
    const visible = labels(result.current);
    expect(visible).toContain("Admin");
    expect(visible).toContain("HR Reports");
    expect(visible).toContain("Pending Approvals");
    expect(visible).toContain("Overtime");
  });

  it("returns public items when no roles are provided", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("Dashboard");
    expect(visible).toContain("Calendar");
    expect(visible).toContain("Settings");
    expect(visible).not.toContain("Overtime");
  });

  // Branch coverage: each role independently
  it("admin sees admin items but not HR/TL items", () => {
    const { result } = renderHook(() => useVisibleNavItems(true, false, false, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("Admin");
    expect(visible).toContain("Plugins");
    expect(visible).not.toContain("HR Reports");
    expect(visible).not.toContain("Pending Approvals");
  });

  it("HR sees HR items but not admin/TL items", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, true, false, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("HR Reports");
    expect(visible).not.toContain("Admin");
    expect(visible).not.toContain("Pending Approvals");
  });

  it("team leader sees TL items but not admin/HR items", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, true, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("Pending Approvals");
    expect(visible).toContain("Team Overview");
    expect(visible).not.toContain("Admin");
    expect(visible).not.toContain("HR Reports");
  });

  it("employee sees employee-scoped items but not admin/HR/TL items", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, true, false));
    const visible = labels(result.current);
    expect(visible).toContain("Overtime");
    expect(visible).toContain("Standby");
    expect(visible).not.toContain("Admin");
    expect(visible).not.toContain("HR Reports");
    expect(visible).not.toContain("Pending Approvals");
  });

  it("superuser sees all items regardless of other role flags", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, false, true));
    expect(result.current).toHaveLength(14);
  });

  it("admin + HR combo sees both admin and HR items", () => {
    const { result } = renderHook(() => useVisibleNavItems(true, true, false, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("Admin");
    expect(visible).toContain("HR Reports");
  });

  it("admin + TL combo sees both admin and TL items", () => {
    const { result } = renderHook(() => useVisibleNavItems(true, false, true, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("Admin");
    expect(visible).toContain("Pending Approvals");
  });

  it("HR + TL combo sees both HR and TL items", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, true, true, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("HR Reports");
    expect(visible).toContain("Pending Approvals");
  });

  it("employee + TL combo sees both employee and TL items", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, true, true, false));
    const visible = labels(result.current);
    expect(visible).toContain("Overtime");
    expect(visible).toContain("Pending Approvals");
  });

  it("public items (no roles) are always visible regardless of role flags", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, false, false));
    const visible = labels(result.current);
    expect(visible).toContain("Dashboard");
    expect(visible).toContain("Leave");
    expect(visible).toContain("Calendar");
    expect(visible).toContain("Ticket KPI");
    expect(visible).toContain("Settings");
  });

  // CR admin nav filtering — CR-only admins use the same user shell as
  // normal CR users, with Settings as their only standard nav item.
  // Control Room dashboard/access links are injected separately via PluginSlot.
  it("CR-only admin sees only Settings in the unified app shell", () => {
    const { result } = renderHook(() =>
      useVisibleNavItems(false, false, false, false, false, true)
    );
    expect(labels(result.current)).toEqual(["Settings"]);
  });

  it("CR-only admin does not see overtime/standby/calendar/leave/dashboard", () => {
    const { result } = renderHook(() =>
      useVisibleNavItems(false, false, false, false, false, true)
    );
    const visible = labels(result.current);
    expect(visible).not.toContain("Overtime");
    expect(visible).not.toContain("Standby");
    expect(visible).not.toContain("Calendar");
    expect(visible).not.toContain("Leave");
    expect(visible).not.toContain("Dashboard");
    expect(visible).toContain("Settings");
    expect(visible).not.toContain("Ticket KPI");
  });

  it("CR admin + team leader keeps team leader items (multi-role)", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, true, false, false, true));
    const visible = labels(result.current);
    expect(visible).toContain("Pending Approvals");
    expect(visible).toContain("Team Overview");
    // Overtime is a TL-role item, so a CR admin who is also a TL sees it.
    expect(visible).toContain("Overtime");
  });

  it("CR admin + staff is full admin, sees admin items", () => {
    const { result } = renderHook(() => useVisibleNavItems(true, false, false, false, false, true));
    const visible = labels(result.current);
    expect(visible).toContain("Admin");
    expect(visible).toContain("Plugins");
  });

  it("CR admin flag defaults to false (backwards compatible)", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, true, false));
    const visible = labels(result.current);
    expect(visible).toContain("Overtime");
  });

  // CR user (non-admin with ControlRoomAccess) nav filtering — see
  // CONTEXT.md rule 11. CR-only users see only Settings; their
  // primary view is /control-room/dashboard (injected via
  // PluginSlot as ControlRoomSidebarItem, NOT part of allNavItems).
  it("CR-only user sees only Settings (Control Room dashboard is via PluginSlot)", () => {
    const { result } = renderHook(() =>
      useVisibleNavItems(false, false, false, false, false, false, true)
    );
    const visible = labels(result.current);
    expect(visible).toEqual(["Settings"]);
  });

  it("CR-only admin sees My Settings in the unified app shell", () => {
    const { result } = renderHook(() =>
      useVisibleNavItems(false, false, false, false, false, true, false)
    );
    const visible = labels(result.current);
    expect(visible).toEqual(["Settings"]);
  });

  it("CR-only user does NOT see Dashboard or overtime/standby/leave/calendar/ticket-kpi", () => {
    const { result } = renderHook(() =>
      useVisibleNavItems(false, false, false, false, false, false, true)
    );
    const visible = labels(result.current);
    expect(visible).not.toContain("Dashboard");
    expect(visible).not.toContain("Overtime");
    expect(visible).not.toContain("Standby");
    expect(visible).not.toContain("Leave");
    expect(visible).not.toContain("Calendar");
    expect(visible).not.toContain("Ticket KPI");
  });

  it("CR user + team leader keeps TL items (higher role wins)", () => {
    const { result } = renderHook(() =>
      useVisibleNavItems(false, false, true, false, false, false, false)
    );
    const visible = labels(result.current);
    expect(visible).toContain("Pending Approvals");
    expect(visible).toContain("Team Overview");
    // isCRUser is false when isTeamLeader is true (computed in
    // computePermissions), so the CR user restriction does not apply.
  });

  it("isCRUser flag defaults to false (backwards compatible)", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, true, false));
    const visible = labels(result.current);
    expect(visible).toContain("Overtime");
    expect(visible).toContain("Leave");
  });

  // Nav section model — every item carries the section used by SidebarNav
  // to render the static group labels (Core Ops / Leadership / Skills & KPI /
  // System). Grouping is derived from the SAME role filter as visibility.
  it("assigns the exact section per item for a superuser", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, false, true));
    const byLabel = Object.fromEntries(result.current.map((item) => [item.label, item.section]));
    expect(byLabel).toEqual({
      Dashboard: "core",
      Overtime: "core",
      Standby: "core",
      Leave: "core",
      Calendar: "core",
      "Pending Approvals": "leadership",
      "Team Overview": "leadership",
      "HR Reports": "leadership",
      Plugins: "system",
      Admin: "system",
      "Ticket KPI": "skills-kpi",
      "Team Performance": "skills-kpi",
      "Upload Management": "skills-kpi",
      Settings: "system",
    });
  });

  it("employee items include no leadership section", () => {
    const { result } = renderHook(() => useVisibleNavItems(false, false, false, true, false));
    const sections = result.current.map((item) => item.section);
    expect(sections).not.toContain("leadership");
  });

  it("CR-only user's single visible item is in the system section", () => {
    const { result } = renderHook(() =>
      useVisibleNavItems(false, false, false, false, false, false, true)
    );
    expect(result.current).toHaveLength(1);
    expect(result.current[0].section).toBe("system");
  });
});
