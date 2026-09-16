import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventCard } from "./EventCard";
import type { CalendarEvent } from "./types";

const baseEvent: CalendarEvent = {
  id: "sb-1",
  title: "SB: 8h",
  start: "2024-06-15",
  end: "2024-06-15",
  type: "standby",
  status: "approved",
  userId: 1,
  userName: "Alice",
  compactLabel: "Standby (8h)",
};

const renderCard = (overrides: Partial<CalendarEvent> = {}) =>
  render(<EventCard event={{ ...baseEvent, ...overrides } as CalendarEvent} />);

describe("EventCard", () => {
  it("colors a standby event with the standby (amber) type tone", () => {
    const { container } = renderCard();
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-amber-50");
    expect(card.className).toContain("dark:bg-amber-950/30");
  });

  it("colors a vacation event with the vacation (emerald) type tone", () => {
    const { container } = renderCard({ type: "vacation", status: "approved" });
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-emerald-50");
  });

  it("colors a holiday event with the holiday (sky) type tone", () => {
    const { container } = renderCard({
      type: "holiday",
      status: "approved",
      title: "Christmas",
    });
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-sky-50");
  });

  it("shows the pending indicator dot only for pending events", () => {
    const { container, unmount } = renderCard({ status: "pending" });
    expect(container.querySelector('[title="Pending approval"]')).not.toBeNull();
    unmount();

    const approved = renderCard({ status: "approved" });
    expect(approved.container.querySelector('[title="Pending approval"]')).toBeNull();
  });

  it("renders the compact label", () => {
    renderCard();
    expect(screen.getByText("Standby (8h)")).toBeInTheDocument();
  });

  it("shows client names in a standby event's compact label", () => {
    renderCard({
      clientNames: ["Acme Corp", "Globex"],
      compactLabel: "Standby (8h) · Acme Corp, Globex",
    });
    expect(screen.getByText("Standby (8h) · Acme Corp, Globex")).toBeInTheDocument();
  });
});
