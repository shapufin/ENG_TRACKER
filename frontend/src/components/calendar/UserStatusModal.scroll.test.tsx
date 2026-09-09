import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { UserStatusModal } from "./UserStatusModal";

vi.mock("./hooks/useUserStatusData", () => ({
  useUserStatusData: () => ({
    hasBalanceData: true,
    remainingDays: 10,
    usedDays: 5,
    pendingDays: 3,
    totalDays: 22,
    vacationYear: 2026,
    carryOverDetail: { days: 0 },
    currentDetail: { totalDays: 22 },
    remainingProgress: 45,
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

const dialogClass = () =>
  (document.querySelector("[role='dialog']") as HTMLElement | null)?.className ?? "";

// Scroll contract: header stays visible, only the body scrolls. A fixed
// h-[90vh] whole-scroll shell pushes the header off on short viewports.
describe("UserStatusModal scroll contract", () => {
  it("dialog is a bounded flex column, not a fixed-height whole-scroll shell", () => {
    renderModal();
    const cls = dialogClass();
    expect(cls).toContain("flex-col");
    expect(cls).toContain("overflow-hidden");
    expect(cls).not.toContain("overflow-y-auto");
    expect(cls).not.toMatch(/(^|\s)h-\[90vh\]/);
    expect(cls).not.toContain("max-w-4xl");
  });

  it("matches the mockup surface: rounded-3xl shell with a bar-free scroll body", () => {
    renderModal();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("sm:rounded-3xl");
    const body = document.querySelector(".flex-1.overflow-y-auto") as HTMLElement;
    expect(body.className).toContain("no-scrollbar");
  });

  it("has a shrink-0 header region and a flex-1 scrollable body region", () => {
    renderModal();
    // NOTE: Radix renders DialogContent in a portal on document.body,
    // so queries must run against document, not the render container.
    expect(document.querySelectorAll(".shrink-0").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
  });

  it("custom close button meets the 44px touch target", () => {
    renderModal();
    const close = document.querySelector("[role='dialog'] button") as HTMLElement | null;
    expect(close).not.toBeNull();
    expect(close!.className).toContain("h-11");
    expect(close!.className).toContain("w-11");
  });
});
