import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthGrid } from "./MonthGrid";

vi.mock("./hooks/useMonthGrid", () => ({
  useMonthGrid: () => ({
    monthStart: new Date("2024-06-01"),
    displayRows: [
      [
        new Date("2024-05-27"),
        new Date("2024-05-28"),
        new Date("2024-05-29"),
        new Date("2024-05-30"),
        new Date("2024-05-31"),
        new Date("2024-06-01"),
        new Date("2024-06-02"),
      ],
    ],
    weekDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    getWeekNumber: () => 22,
    getDayEvents: () => [],
  }),
}));

vi.mock("./CalendarDayCell", () => ({
  CalendarDayCell: ({ date }: { date: Date }) => <div data-testid={`day-${date.getDate()}`} />,
}));

describe("MonthGrid mobile responsiveness", () => {
  it("does not force a fixed 720px min-width on mobile", () => {
    render(<MonthGrid currentMonth={new Date("2024-06-15")} events={[]} onSelectDate={() => {}} />);

    const grid = screen.getByRole("grid");
    expect(grid.className).not.toMatch(/(^|\s)min-w-\[720px\]/);
    expect(grid.className).toContain("md:min-w-[720px]");
  });
});
