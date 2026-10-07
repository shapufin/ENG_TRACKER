import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AdminOverview } from "@/types";
import { OverviewWidgets } from "./OverviewWidgets";

const data: AdminOverview = {
  headcount: {
    total_users: 40,
    active_users: 36,
    inactive_users: 4,
    new_hires_30d: 3,
    never_logged_in: 5,
  },
  coverage_gaps: {
    teams_without_leader: 2,
    users_without_team: 1,
    users_without_tech: 0,
    employees_without_tl: 3,
    al_tls_without_hbpr_assignment: 1,
  },
  pending_backlog: {
    overtime: { count: 4, hours: 12.5 },
    standby: { count: 2, hours: 16 },
    leave: { count: 3, days: 9 },
  },
  approval_aging: {
    buckets: ["0-3d", "4-7d", "8-14d", "15d+"],
    overtime: [1, 1, 1, 1],
    standby: [0, 0, 0, 2],
    leave: [1, 1, 1, 0],
  },
  leave_utilization: {
    year: 2026,
    total_days: 200,
    used_days: 50,
    pending_days: 10,
    available_days: 140,
    utilization_pct: 25,
  },
  carryover_expiry: { window_days: 60, days_at_risk: 11.5, users_affected: 4 },
  period_close: {
    period: "2026-09",
    tls_total: 6,
    tls_closed: 4,
    tls_open: 2,
    open_tls: [
      { id: 1, name: "Ana TL" },
      { id: 2, name: "Beni TL" },
    ],
  },
  backup: {
    count: 3,
    last_created_at: "2026-09-20T10:00:00Z",
    age_hours: 400,
    size_mb: 12.5,
    stale: true,
  },
};

const renderAll = (overrides: Partial<React.ComponentProps<typeof OverviewWidgets>> = {}) =>
  render(
    <OverviewWidgets
      isWidgetActive={() => true}
      data={data}
      isSuperuser
      {...overrides}
    />
  );

describe("OverviewWidgets", () => {
  it("renders every active widget with real values", () => {
    renderAll();
    expect(screen.getByText("Headcount")).toBeInTheDocument();
    expect(screen.getByText("36 active")).toBeInTheDocument();
    expect(screen.getByText("Coverage Gaps")).toBeInTheDocument();
    expect(screen.getByText("Teams without a leader")).toBeInTheDocument();
    expect(screen.getByText("Pending Backlog")).toBeInTheDocument();
    expect(screen.getByText("12.5h overtime · 16h standby · 9d leave")).toBeInTheDocument();
    expect(screen.getByText("Approval Aging")).toBeInTheDocument();
    expect(screen.getByText("Leave Utilization")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("Carryover Expiry")).toBeInTheDocument();
    expect(screen.getByText("11.5d")).toBeInTheDocument();
    expect(screen.getByText("Period Close (2026-09)")).toBeInTheDocument();
    expect(screen.getByText("Ana TL, Beni TL")).toBeInTheDocument();
    expect(screen.getByText("Backup Status")).toBeInTheDocument();
  });

  it("renders nothing for inactive widgets", () => {
    renderAll({ isWidgetActive: (id) => id === "org-headcount" });
    expect(screen.getByText("Headcount")).toBeInTheDocument();
    expect(screen.queryByText("Coverage Gaps")).toBeNull();
    expect(screen.queryByText("Approval Aging")).toBeNull();
  });

  it("never shows the backup card to a non-superuser, even with data present", () => {
    renderAll({ isSuperuser: false });
    expect(screen.queryByText("Backup Status")).toBeNull();
  });

  it("flags a stale or missing backup", () => {
    renderAll();
    expect(screen.getByText("Stale — over 7 days old")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no backups", () => {
    renderAll({ data: { ...data, backup: { ...data.backup!, count: 0, age_hours: null, size_mb: null } } });
    expect(screen.getByText("No backups yet")).toBeInTheDocument();
  });

  it("shows a utilization dash when there are no balances", () => {
    renderAll({
      data: { ...data, leave_utilization: { ...data.leave_utilization, utilization_pct: null } },
    });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows skeletons while loading", () => {
    const { container } = renderAll({ data: undefined, isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows an error card with retry when the request fails", () => {
    renderAll({ data: undefined, isError: true, onRetry: () => {} });
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders nothing when no overview widget is active", () => {
    const { container } = renderAll({ isWidgetActive: () => false });
    expect(container).toBeEmptyDOMElement();
  });
});
