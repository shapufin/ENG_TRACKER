import React, { createContext, useContext } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CRByDayView } from "./CRByDayView";
import { mockRoster, extraDayRow } from "./crTestFixtures";

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children, className }: any) => (
    <div data-testid="glass-card" className={className}>
      {children}
    </div>
  ),
}));

// Mock Popover with context so PopoverContent only renders when open=true,
// mirroring Radix's portal behavior. PopoverTrigger calls onOpenChange on click.
const OpenCtx = createContext(false);
const ChangeCtx = createContext<(v: boolean) => void>(() => {});
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children, open, onOpenChange }: any) => (
    <OpenCtx.Provider value={open}>
      <ChangeCtx.Provider value={onOpenChange}>
        <div data-testid="popover" data-open={open}>
          {children}
        </div>
      </ChangeCtx.Provider>
    </OpenCtx.Provider>
  ),
  PopoverTrigger: ({ children }: any) => {
    const onOpenChange = useContext(ChangeCtx);
    return (
      <div
        data-testid="popover-trigger"
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(true);
        }}
      >
        {children}
      </div>
    );
  },
  PopoverContent: ({ children }: any) => {
    const open = useContext(OpenCtx);
    return open ? <div data-testid="popover-content">{children}</div> : null;
  },
}));

// Multi-day roster: base 2 rows on 2026-07-27 + 1 extra row on 2026-07-28.
const multiDayRoster = [...mockRoster, extraDayRow];

describe("CRByDayView", () => {
  it("renders a calendar grid with weekday headers", () => {
    render(<CRByDayView roster={multiDayRoster} />);
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });

  it("shows the month label for the roster's date range", () => {
    render(<CRByDayView roster={multiDayRoster} />);
    expect(screen.getByText("July 2026")).toBeInTheDocument();
  });

  it("shows empty state when roster is empty", () => {
    render(<CRByDayView roster={[]} />);
    expect(screen.getByText(/No standby scheduled in this range/i)).toBeInTheDocument();
  });

  it("renders initials (not full names) in day cells — compact for many users", () => {
    render(<CRByDayView roster={multiDayRoster} />);
    // Alice → "AL", Bob → "BO". Full names should NOT be in cells.
    const als = screen.getAllByText("AL");
    expect(als.length).toBeGreaterThanOrEqual(1);
    const bos = screen.getAllByText("BO");
    expect(bos.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT render full user names in day cells (only initials)", () => {
    render(<CRByDayView roster={multiDayRoster} />);
    // Full names appear only in the popover, not in cells.
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("renders day numbers for the month", () => {
    render(<CRByDayView roster={multiDayRoster} />);
    expect(screen.getAllByText("27").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("28").length).toBeGreaterThanOrEqual(1);
  });

  it("renders overnight moon icon for overnight rows", () => {
    const { container } = render(<CRByDayView roster={multiDayRoster} />);
    const moons = container.querySelectorAll(".lucide-moon");
    expect(moons.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT render status badges (approved-only dashboard)", () => {
    render(<CRByDayView roster={multiDayRoster} />);
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("shows +N overflow when a day has more than 4 people", () => {
    const fivePeopleRoster = [
      { ...mockRoster[0], id: 1, user_id: 10, user_name: "Alice Adams" },
      { ...mockRoster[0], id: 2, user_id: 11, user_name: "Bob Brown" },
      { ...mockRoster[0], id: 3, user_id: 12, user_name: "Carol Clark" },
      { ...mockRoster[0], id: 4, user_id: 13, user_name: "Dave Davis" },
      { ...mockRoster[0], id: 5, user_id: 14, user_name: "Eve Evans" },
    ];
    render(<CRByDayView roster={fivePeopleRoster} />);
    // 5 people, 4 visible → +1 overflow
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("renders team color dots in day cells", () => {
    const { container } = render(<CRByDayView roster={multiDayRoster} />);
    // Team color dots are small rounded-full spans inside cells.
    const dots = container.querySelectorAll(".rounded-full.h-1\\.5");
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it("shows full details in popover when a day cell is clicked", () => {
    render(<CRByDayView roster={multiDayRoster} />);
    // Click the first popover trigger (a day with people).
    const trigger = screen.getAllByTestId("popover-trigger")[0];
    fireEvent.click(trigger);
    // Popover content should now show full names + shift times.
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("popover shows team names and shift times", () => {
    render(<CRByDayView roster={multiDayRoster} />);
    const trigger = screen.getAllByTestId("popover-trigger")[0];
    fireEvent.click(trigger);
    // Team names from mockRoster fixtures.
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    // Shift times (formatTime renders "8:00 AM" style).
    expect(screen.getByText(/8:00 AM/i)).toBeInTheDocument();
  });

  it("popover header shows person count and formatted date", () => {
    render(<CRByDayView roster={multiDayRoster} />);
    const trigger = screen.getAllByTestId("popover-trigger")[0];
    fireEvent.click(trigger);
    // "2 people on standby" for the first day (Alice + Bob).
    expect(screen.getByText(/2 people on standby/i)).toBeInTheDocument();
  });
});
