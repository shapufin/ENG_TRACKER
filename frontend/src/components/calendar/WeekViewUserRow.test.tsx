import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeekViewUserRow } from "./WeekViewUserRow";

vi.mock("./UserAvatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("./EventTooltip", () => ({
  EventTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

const user = { id: 1, first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" } as any;
const days = [new Date("2026-08-10T12:00:00")];

describe("WeekViewUserRow", () => {
  it("supports dragging across week cells without relying on click", () => {
    const onRangeDragStart = vi.fn();
    const onRangeDragEnter = vi.fn();
    const onRangeDragEnd = vi.fn();
    const onSelectDate = vi.fn();
    const { container } = render(
      <WeekViewUserRow
        user={user}
        days={days}
        groupedEvents={{}}
        onSelectDate={onSelectDate}
        onRangeDragStart={onRangeDragStart}
        onRangeDragEnter={onRangeDragEnter}
        onRangeDragEnd={onRangeDragEnd}
        isRangeSelecting={true}
      />
    );

    const dayCell = container.querySelector(".min-h-\\[92px\\]") as HTMLElement;
    fireEvent.mouseDown(dayCell);
    fireEvent.mouseEnter(dayCell);
    fireEvent.mouseUp(dayCell);
    fireEvent.click(dayCell);

    expect(onRangeDragStart).toHaveBeenCalledWith(days[0]);
    expect(onRangeDragEnter).toHaveBeenCalledWith(days[0]);
    expect(onRangeDragEnd).toHaveBeenCalledWith(days[0]);
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it("provides title attributes on truncated user name and team for accessible full-value path", () => {
    const teamUser = {
      ...user,
      teams: [{ id: 1, name: "Engineering Platform Operations" }],
    } as any;
    const { container } = render(
      <WeekViewUserRow user={teamUser} days={days} groupedEvents={{}} />
    );
    const nameEl = container.querySelector(".truncate.text-sm") as HTMLElement;
    expect(nameEl).toHaveAttribute("title");
    const teamEl = container.querySelector(".truncate.text-\\[11px\\]") as HTMLElement;
    expect(teamEl).toHaveAttribute("title", "Engineering Platform Operations");
  });
});
