import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeekViewUserRow } from "./WeekViewUserRow";

vi.mock("./UserAvatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("./EventTooltip", async () => {
  const React = await import("react");
  return {
    EventTooltip: ({
      children,
      event,
      onEventActivate,
    }: {
      children: React.ReactElement;
      event: unknown;
      onEventActivate?: (e: unknown) => void;
    }) => React.cloneElement(children, { onActivate: () => onEventActivate?.(event) } as never),
  };
});

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

  it("activates an event pill by click and keyboard without selecting the date", () => {
    const onEventActivate = vi.fn();
    const onSelectDate = vi.fn();
    const event = {
      id: "e1",
      type: "vacation",
      start: "2026-08-10",
      end: "2026-08-10",
      compactLabel: "Ada V",
    } as any;
    const { getByRole } = render(
      <WeekViewUserRow
        user={user}
        days={days}
        groupedEvents={{ "1-2026-08-10": [event] }}
        onSelectDate={onSelectDate}
        onEventActivate={onEventActivate}
      />
    );
    const pill = getByRole("button", { name: /Ada V/ });
    fireEvent.click(pill);
    fireEvent.keyDown(pill, { key: "Enter" });
    expect(onEventActivate).toHaveBeenCalledTimes(2);
    expect(onEventActivate).toHaveBeenCalledWith(event);
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it("tints empty cells on a conflict day but not cells holding an event", () => {
    const event = {
      id: "e1",
      type: "vacation",
      start: "2026-08-10",
      end: "2026-08-10",
      compactLabel: "Ada V",
    } as any;
    const conflicts = new Map([["2026-08-10", {}]]) as any;
    const { container, rerender } = render(
      <WeekViewUserRow user={user} days={days} groupedEvents={{}} conflictsByDate={conflicts} />
    );
    expect(container.querySelector(".min-h-\\[92px\\]")).toHaveClass("bg-tone-warning-surface/40");
    rerender(
      <WeekViewUserRow
        user={user}
        days={days}
        groupedEvents={{ "1-2026-08-10": [event] }}
        conflictsByDate={conflicts}
      />
    );
    expect(container.querySelector(".min-h-\\[92px\\]")).not.toHaveClass(
      "bg-tone-warning-surface/40"
    );
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
    const teamEl = container.querySelector(".truncate.text-xs") as HTMLElement;
    expect(teamEl).toHaveAttribute("title", "Engineering Platform Operations");
  });
});
