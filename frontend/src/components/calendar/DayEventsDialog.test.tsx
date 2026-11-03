import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DayEventsDialog } from "./DayEventsDialog";
import type { CalendarEvent } from "./types";
import type { DayConflict } from "@/lib/calendarCoverage";

const date = new Date(2026, 10, 17);

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "evt-1",
  title: "Enri Demnushi (3d)",
  compactLabel: "Enri (3d)",
  start: "2026-11-17",
  end: "2026-11-17",
  type: "vacation",
  status: "approved",
  userId: 1,
  userName: "Enri Demnushi",
  days: 3,
  ...overrides,
});

const conflict: DayConflict = {
  dateKey: "2026-11-17",
  coveragePct: 25,
  away: 3,
  total: 4,
  users: [
    { id: 1, name: "Enri Demnushi", type: "vacation", status: "approved" },
    { id: 2, name: "Ana Hoxha", type: "sick", status: "approved" },
  ],
};

describe("DayEventsDialog", () => {
  it("lists every entry for the day with the date and count", () => {
    render(
      <DayEventsDialog
        open
        onOpenChange={vi.fn()}
        date={date}
        events={[event(), event({ id: "evt-2", compactLabel: "Ana (1d)", title: "Ana" })]}
        onEventActivate={vi.fn()}
      />
    );

    expect(screen.getByText("Tuesday, November 17, 2026")).toBeInTheDocument();
    expect(screen.getByText("2 entries")).toBeInTheDocument();
    expect(screen.getByText("Enri (3d)")).toBeInTheDocument();
    expect(screen.getByText("Ana (1d)")).toBeInTheDocument();
  });

  it("shows the coverage warning without hiding the entries", () => {
    render(
      <DayEventsDialog
        open
        onOpenChange={vi.fn()}
        date={date}
        events={[event()]}
        conflict={conflict}
        onEventActivate={vi.fn()}
      />
    );

    expect(screen.getByText("25% coverage — 3 of 4 away")).toBeInTheDocument();
    expect(screen.getByText("Enri Demnushi, Ana Hoxha")).toBeInTheDocument();
    expect(screen.getByText("Enri (3d)")).toBeInTheDocument();
  });

  it("hands an activated entry to the existing record modal", () => {
    const onEventActivate = vi.fn();
    const first = event();
    render(
      <DayEventsDialog
        open
        onOpenChange={vi.fn()}
        date={date}
        events={[first]}
        onEventActivate={onEventActivate}
      />
    );

    fireEvent.click(screen.getByText("Enri (3d)"));
    expect(onEventActivate).toHaveBeenCalledWith(first);
  });

  it("requests time off for the shown day and closes first", () => {
    const onRequestTimeOff = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <DayEventsDialog
        open
        onOpenChange={onOpenChange}
        date={date}
        events={[]}
        onEventActivate={vi.fn()}
        onRequestTimeOff={onRequestTimeOff}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /request time off/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRequestTimeOff).toHaveBeenCalledWith(date);
  });

  it("shows an empty state instead of a blank body", () => {
    render(
      <DayEventsDialog
        open
        onOpenChange={vi.fn()}
        date={date}
        events={[]}
        onEventActivate={vi.fn()}
      />
    );

    expect(screen.getByText("No entries recorded for this day.")).toBeInTheDocument();
    expect(screen.getByText("0 entries")).toBeInTheDocument();
  });
});
