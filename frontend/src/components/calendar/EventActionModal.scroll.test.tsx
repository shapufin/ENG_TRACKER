import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { EventActionModal } from "./EventActionModal";

vi.mock("./useEventActions", () => ({
  useEventActions: () => ({
    isSubmitting: false,
    saveEdit: vi.fn(),
    remove: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  }),
}));

const event = {
  id: 1,
  type: "vacation",
  userName: "Enri Demnushi",
  userId: 1,
  start: "2026-09-10",
  end: "2026-09-12",
  status: "pending",
} as any;

const dialogClass = () =>
  (document.querySelector("[role='dialog']") as HTMLElement | null)?.className ?? "";

// Scroll contract: the edit/approve stack must be height-guarded so it can
// never clip the viewport on desktop (primitive is sm:overflow-visible).
describe("EventActionModal scroll contract", () => {
  it("dialog carries a max-height guard with a scrollable body", () => {
    render(
      <EventActionModal
        open
        onOpenChange={vi.fn()}
        event={event}
        currentUser={{ id: 2 }}
        canViewTeamData
      />
    );
    const cls = dialogClass();
    expect(cls).toMatch(/max-h-/);
    expect(cls).not.toContain("overflow-y-auto");
    // Mockup booking modal is max-w-lg; the edit/approve stack needs the room.
    expect(cls).toContain("max-w-lg");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
    const body = document.querySelector(".flex-1.overflow-y-auto") as HTMLElement;
    expect(body.className).toContain("no-scrollbar");
  });

  it("custom close affordance meets the 44px touch target", () => {
    render(
      <EventActionModal
        open
        onOpenChange={vi.fn()}
        event={event}
        currentUser={{ id: 2 }}
        canViewTeamData
      />
    );
    const buttons = [...document.querySelectorAll("[role='dialog'] button")];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.some((b) => b.className.includes("h-11"))).toBe(true);
  });
});
