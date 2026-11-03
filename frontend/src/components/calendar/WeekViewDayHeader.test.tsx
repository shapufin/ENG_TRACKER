import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekViewDayHeader } from "./WeekViewDayHeader";
import type { DayConflict } from "@/lib/calendarCoverage";

const conflict: DayConflict = {
  dateKey: "2026-11-03",
  coveragePct: 40,
  away: 3,
  total: 5,
  users: [],
};

describe("WeekViewDayHeader", () => {
  afterEach(() => vi.useRealTimers());

  it("highlights today on the Tirane business clock", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T23:30:00Z")); // Nov 3 in Tirane
    try {
      const days = [2, 3, 4].map((d) => new Date(2026, 10, d));
      render(<WeekViewDayHeader days={days} />);
      expect(screen.getByText("3").className).toContain("text-tone-info-text");
      expect(screen.getByText("2").className).not.toContain("text-tone-info-text");
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it("badges only conflict days when conflictsByDate is given", () => {
    const days = [2, 3, 4].map((d) => new Date(2026, 10, d));
    render(<WeekViewDayHeader days={days} conflictsByDate={new Map([["2026-11-03", conflict]])} />);
    const badges = screen.getAllByLabelText("Staffing conflict: 3 of 5 away, 40% coverage");
    expect(badges).toHaveLength(1);
  });

  it("shows no badge without conflictsByDate", () => {
    const days = [2, 3].map((d) => new Date(2026, 10, d));
    render(<WeekViewDayHeader days={days} />);
    expect(screen.queryByLabelText(/Staffing conflict/)).toBeNull();
  });
});
