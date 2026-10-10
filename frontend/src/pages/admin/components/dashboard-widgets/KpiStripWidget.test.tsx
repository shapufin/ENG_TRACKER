import type React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminOverview } from "@/types";
import { KpiStripWidget } from "./KpiStripWidget";
import { makeOverview } from "./adminFixtures";

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

const stats = { totalUsers: 40, totalTeams: 5, totalPending: 3, overtimeHours: 20 };
const overview = (data: AdminOverview | undefined = makeOverview()) => ({
  data,
  isLoading: false,
  isError: false,
  onRetry: () => {},
});

describe("KpiStripWidget", () => {
  it("shows all six figures in one card, marked for PDF export", () => {
    const { container } = render(<KpiStripWidget {...stats} overview={overview()} />);
    const group = screen.getByRole("group", { name: "Key figures" });
    expect(group).toHaveAttribute("data-chart-section", "kpi-strip");
    expect(container.querySelectorAll("[data-chart-section]")).toHaveLength(1);
    for (const label of ["Users", "Teams", "Pending", "Overtime", "Leave used", "Carryover"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("20h")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("11.5d")).toBeInTheDocument();
  });

  it("uses tabular numerals for every value", () => {
    render(<KpiStripWidget {...stats} overview={overview()} />);
    expect(screen.getByText("40").className).toMatch(/tabular-nums/);
    expect(screen.getByText("25%").className).toMatch(/tabular-nums/);
  });

  it("shows a dash for utilization when there are no balances", () => {
    const base = makeOverview();
    render(
      <KpiStripWidget
        {...stats}
        overview={overview({
          ...base,
          leave_utilization: { ...base.leave_utilization, utilization_pct: null },
        })}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("keeps the stats figures while the overview request is loading", () => {
    render(
      <KpiStripWidget
        {...stats}
        overview={{ data: undefined, isLoading: true, isError: false, onRetry: () => {} }}
      />
    );
    expect(screen.getByRole("group", { name: "Key figures" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.queryByText("25%")).toBeNull();
  });

  it("shows skeletons for the stats figures while stats load", () => {
    const { container } = render(<KpiStripWidget {...stats} statsLoading overview={overview()} />);
    expect(screen.queryByText("40")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(4);
  });

  it("offers a retry when the overview request fails and leaves the stats alone", () => {
    const onRetry = vi.fn();
    render(
      <KpiStripWidget
        {...stats}
        overview={{ data: undefined, isLoading: false, isError: true, onRetry }}
      />
    );
    expect(screen.getByText("40")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("links each figure to its admin page", () => {
    render(<KpiStripWidget {...stats} overview={overview()} />);
    const hrefs = {
      Users: "/admin/users",
      Teams: "/admin/teams",
      Pending: "/admin/leave-requests",
      Overtime: "/admin/overtime-logs",
      "Leave used": "/admin/leave-balances",
      Carryover: "/admin/leave-balances?expiring=1",
    };
    for (const [label, href] of Object.entries(hrefs)) {
      expect(screen.getByText(label).closest("a")).toHaveAttribute("href", href);
    }
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });

  it("shows the real new-hire delta under Users", () => {
    render(<KpiStripWidget {...stats} overview={overview()} />);
    expect(screen.getByText("+3 new · 30d")).toBeInTheDocument();
  });

  it("shows a flat delta when nobody joined", () => {
    const base = makeOverview();
    render(
      <KpiStripWidget
        {...stats}
        overview={overview({ ...base, headcount: { ...base.headcount, new_hires_30d: 0 } })}
      />
    );
    expect(screen.getByText("+0 new · 30d")).toBeInTheDocument();
  });
});
