import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
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
vi.mock("./CurrentYearCard", () => ({ CurrentYearCard: () => <div data-testid="current-year" /> }));
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

  it("two-card row collapses on mobile and is 2-up from sm up", () => {
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
    expect(grids.length).toBeGreaterThan(0);
  });
});
