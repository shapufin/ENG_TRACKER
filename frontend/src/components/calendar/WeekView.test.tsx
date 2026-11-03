import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { WeekView } from "./WeekView";

vi.mock("./WeekViewHeader", () => ({
  WeekViewHeader: () => <div data-testid="week-header" />,
}));
vi.mock("./WeekViewDayHeader", () => ({
  WeekViewDayHeader: () => <div data-testid="day-header" />,
}));
const rowProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock("./WeekViewUserRow", () => ({
  WeekViewUserRow: (props: Record<string, unknown>) => {
    rowProps.last = props;
    return <div data-testid="user-row" />;
  },
}));
vi.mock("./weekViewUtils", () => ({
  getWeekDays: () => [
    new Date("2024-06-10"),
    new Date("2024-06-11"),
    new Date("2024-06-12"),
    new Date("2024-06-13"),
    new Date("2024-06-14"),
    new Date("2024-06-15"),
    new Date("2024-06-16"),
  ],
  groupEventsByDay: () => ({}),
}));

describe("WeekView mobile responsiveness", () => {
  it("does not force a fixed 900px min-width on mobile", () => {
    const { container } = render(
      <WeekView currentDate={new Date("2024-06-15")} users={[]} events={[]} />
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.className).not.toMatch(/(^|\s)min-w-\[900px\]/);
    expect(root.className).toContain("md:min-w-[900px]");
  });
});

describe("WeekView pass-through", () => {
  it("hands event activation and conflicts down to each user row", () => {
    const onEventActivate = vi.fn();
    const conflictsByDate = new Map();
    render(
      <WeekView
        currentDate={new Date("2024-06-15")}
        users={[{ id: 1 } as never]}
        events={[]}
        onEventActivate={onEventActivate}
        conflictsByDate={conflictsByDate}
      />
    );
    expect(rowProps.last?.onEventActivate).toBe(onEventActivate);
    expect(rowProps.last?.conflictsByDate).toBe(conflictsByDate);
  });
});
