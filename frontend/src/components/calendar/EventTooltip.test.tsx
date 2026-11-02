import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EventTooltip } from "./EventTooltip";
import type { CalendarEvent } from "./types";

const event = {
  id: "vac-1",
  title: "Vac: 3d",
  start: "2026-11-17",
  end: "2026-11-19",
  type: "vacation",
  status: "approved",
  userId: 7,
  userName: "Alice Smith",
  days: 3,
  description: "Family trip",
  compactLabel: "Vacation (3d)",
} as CalendarEvent;

const open = (ui: React.ReactElement) => {
  render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
  fireEvent.focus(screen.getByRole("button", { name: "trigger" }));
};

describe("EventTooltip", () => {
  it("is a concise card: person, type, date range, quantity and the note", () => {
    open(
      <EventTooltip event={event}>
        <button aria-label="trigger" />
      </EventTooltip>
    );
    expect(screen.getAllByText("Alice Smith").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/vacation/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nov 17 → Nov 19").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3d").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Family trip/).length).toBeGreaterThan(0);
  });

  it("warns when the day is below the coverage threshold", () => {
    open(
      <EventTooltip event={event} hasConflict>
        <button aria-label="trigger" />
      </EventTooltip>
    );
    expect(screen.getAllByText(/coverage warning/i).length).toBeGreaterThan(0);
  });

  it("shows no warning on a normal day", () => {
    open(
      <EventTooltip event={event}>
        <button aria-label="trigger" />
      </EventTooltip>
    );
    expect(screen.queryByText(/coverage warning/i)).toBeNull();
  });

  it("opens the person from the card", () => {
    const onUserClick = vi.fn();
    open(
      <EventTooltip event={event} onUserClick={onUserClick}>
        <button aria-label="trigger" />
      </EventTooltip>
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Alice Smith/ })[0]);
    expect(onUserClick).toHaveBeenCalledWith(7);
  });

  it("uses tone tokens only", () => {
    open(
      <EventTooltip event={event} hasConflict>
        <button aria-label="trigger" />
      </EventTooltip>
    );
    expect(document.body.innerHTML).not.toMatch(/emerald|rose-|amber-|sky-|dark:/);
  });
});
