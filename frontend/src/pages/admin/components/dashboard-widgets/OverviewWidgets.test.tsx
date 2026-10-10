import { describe, it, expect, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminOverview } from "@/types";
import { OverviewWidgets } from "./OverviewWidgets";
import { makeOverview } from "./adminFixtures";

const data: AdminOverview = makeOverview();

const stats = { totalUsers: 40, totalTeams: 5, totalPending: 3, overtimeHours: 20 };

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

const renderAll = (overrides: Partial<React.ComponentProps<typeof OverviewWidgets>> = {}) =>
  render(
    <OverviewWidgets
      isWidgetActive={() => true}
      data={data}
      isSuperuser
      stats={stats}
      {...overrides}
    />
  );

describe("OverviewWidgets", () => {
  it("renders every overview widget with real values", () => {
    renderAll();
    expect(screen.getByRole("group", { name: "Key figures" })).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("11.5d")).toBeInTheDocument();
    expect(screen.getByText("Coverage Gaps")).toBeInTheDocument();
    expect(screen.getByText("Teams without a leader")).toBeInTheDocument();
    expect(screen.getByText("Period Close (2026-09)")).toBeInTheDocument();
    expect(screen.getByText("Ana TL, Beni TL")).toBeInTheDocument();
    expect(screen.getByText("Backup Status")).toBeInTheDocument();
  });

  it("coverage gaps absorbs the headcount extras without counting them as gaps", () => {
    renderAll();
    expect(screen.getByText("New in 30 days").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Never logged in").nextElementSibling).toHaveTextContent("5");
    expect(screen.getByText("Never logged in").nextElementSibling?.className).not.toMatch(
      /text-warning/
    );
  });

  it("coverage gaps tint non-zero counts with the warning tone and mute zeros", () => {
    renderAll();
    const counts = screen
      .getAllByText(
        /^(Teams without a leader|Users without a team|Users without a tech|Employees without a TL|Albanian TLs without HBPR)$/
      )
      .map((el) => el.nextElementSibling as HTMLElement);
    expect(counts).toHaveLength(5);
    for (const c of counts) {
      expect(c.className).toMatch(
        Number(c.textContent) > 0 ? /text-tone-warning-text/ : /text-muted-foreground/
      );
    }
  });

  it("renders nothing for inactive widgets", () => {
    renderAll({ isWidgetActive: (id) => id === "kpi-strip" });
    expect(screen.getByRole("group", { name: "Key figures" })).toBeInTheDocument();
    expect(screen.queryByText("Coverage Gaps")).toBeNull();
    expect(screen.queryByText(/Period Close/)).toBeNull();
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
    renderAll({
      data: { ...data, backup: { ...data.backup!, count: 0, age_hours: null, size_mb: null } },
    });
    expect(screen.getByText("No backups yet")).toBeInTheDocument();
  });

  it("shows a utilization dash when there are no balances", () => {
    renderAll({
      data: { ...data, leave_utilization: { ...data.leave_utilization, utilization_pct: null } },
    });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a placeholder per card while loading", () => {
    renderAll({ data: undefined, isLoading: true });
    expect(screen.getByRole("status", { name: /loading coverage gaps/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /loading period close/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Key figures" })).toHaveAttribute("aria-busy", "true");
  });

  it("shows a retry card per widget when the request fails", () => {
    const onRetry = vi.fn();
    renderAll({ data: undefined, isError: true, onRetry });
    expect(screen.getByText(/couldn't load coverage gaps/i)).toBeInTheDocument();
    expect(screen.getByText(/couldn't load period close/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /retry/i })[0]);
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders nothing when no overview widget is active", () => {
    const { container } = renderAll({ isWidgetActive: () => false });
    expect(container).toBeEmptyDOMElement();
  });
});
