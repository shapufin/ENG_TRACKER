import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { UserStatusModal } from "./UserStatusModal";

vi.mock("./hooks/useUserStatusData", () => ({
  useUserStatusData: () => ({
    hasBalanceData: true,
    remainingDays: 0,
    usedDays: 5,
    pendingDays: 3,
    totalDays: 22,
    vacationYear: 2026,
    carryOverDetail: { days: 0 },
    currentDetail: { totalDays: 22 },
    remainingProgress: 0,
    usedProgress: 23,
    pendingProgress: 14,
    carryOverProgress: 0,
    upcomingHolidays: [],
  }),
}));

vi.mock("./CarryOverCard", () => ({ CarryOverCard: () => <div data-testid="carry-over" /> }));
vi.mock("./UpcomingHolidays", () => ({ UpcomingHolidays: () => <div data-testid="holidays" /> }));
vi.mock("./UserAvatar", () => ({ UserAvatar: () => <div data-testid="avatar" /> }));

const renderModal = () =>
  render(
    <UserStatusModal
      open
      onOpenChange={vi.fn()}
      user={
        {
          id: 1,
          username: "enri.demnushi",
          email: "enri@example.com",
          first_name: "Enri",
          last_name: "Demnushi",
          teams: [{ id: 1, name: "SIAE_TEAM" }],
        } as any
      }
      vacationBalances={[
        { id: 1, year: 2026, total_days: "22.00", used_days: 5, pending_days: 3 } as any,
      ]}
      holidays={[] as any}
    />
  );

// Responsive contract: the 3 stat cards must collapse to a single column on
// mobile — a fixed grid-cols-3 inside the overflow-hidden dialog clips the
// cards at 375px (observed in the interactive modal capture).
describe("UserStatusModal responsive grids", () => {
  it("stat-card grid collapses on mobile and is 3-up from sm up", () => {
    renderModal();

    const grid = document.querySelector("div.grid.grid-cols-1") as HTMLElement | null;
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain("sm:grid-cols-3");
    expect(grid!.className).not.toMatch(/(^|\s)grid-cols-3(\s|$)/);
  });

  it("carry-over renders full-width (no two-card row) without the removed current-year card", () => {
    render(
      <UserStatusModal
        open
        onOpenChange={vi.fn()}
        user={{ id: 1, username: "e2e", email: "", first_name: "E", last_name: "A" } as any}
        vacationBalances={[{ id: 1 } as any]}
        holidays={[] as any}
      />
    );

    const grids = [...document.querySelectorAll("div.grid")].filter((g) =>
      g.className.includes("sm:grid-cols-2")
    );
    expect(grids.length).toBe(0);
  });

  it("renders carry-over and holidays sections without the removed current-year card", () => {
    renderModal();

    expect(document.querySelector('[data-testid="carry-over"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="holidays"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="current-year"]')).toBeNull();
  });

  it("switches to Leave History tab and displays user leave events", () => {
    const { getByRole, getByText } = render(
      <UserStatusModal
        open
        onOpenChange={vi.fn()}
        user={
          {
            id: 1,
            username: "enri",
            email: "enri@example.com",
            first_name: "Enri",
            last_name: "Demnushi",
          } as any
        }
        userEvents={[
          {
            id: "vac-101",
            title: "Vac: 2d",
            type: "vacation",
            status: "approved",
            start: "2026-11-10",
            end: "2026-11-12",
            days: 2,
            description: "Family trip",
          } as any,
        ]}
      />
    );

    fireEvent.click(getByRole("button", { name: /Leave History/ }));
    expect(getByText("vacation")).toBeInTheDocument();
    expect(getByText("(2 days)")).toBeInTheDocument();
    expect(getByText('"Family trip"')).toBeInTheDocument();
    expect(getByText("approved")).toBeInTheDocument();
  });

  it("switches to Policy & Rules tab and displays coverage and carryover policies", () => {
    const { getByRole, getByText } = render(
      <UserStatusModal
        open
        onOpenChange={vi.fn()}
        user={
          {
            id: 1,
            username: "enri",
            email: "enri@example.com",
            first_name: "Enri",
            last_name: "Demnushi",
          } as any
        }
      />
    );

    fireEvent.click(getByRole("button", { name: /Policy & Rules/ }));
    expect(getByText("Allowance & Carryover Rules")).toBeInTheDocument();
    expect(getByText("Team Coverage Minimums")).toBeInTheDocument();
  });
});
