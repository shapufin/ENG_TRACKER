import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarDayCell } from "./CalendarDayCell";

vi.mock("./EventTooltip", () => ({ EventTooltip: ({ children }: any) => children }));
vi.mock("./EventCard", () => ({
  EventCard: ({ event }: any) => <div data-testid={`event-${event.id}`}>{event.title}</div>,
}));

const date = new Date("2024-01-15");
const events = [
  { id: 1, title: "E1" },
  { id: 2, title: "E2" },
  { id: 3, title: "E3" },
] as any;

describe("CalendarDayCell", () => {
  it("renders day and events", () => {
    const onSelect = vi.fn();
    render(
      <CalendarDayCell date={date} events={events} isCurrentMonth={true} onSelect={onSelect} />
    );
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("calls onSelect on Enter key", () => {
    const onSelect = vi.fn();
    render(<CalendarDayCell date={date} events={[]} isCurrentMonth={true} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("gridcell"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(date);
  });

  it("handles range drag", () => {
    const onRangeDragStart = vi.fn();
    const onRangeDragEnter = vi.fn();
    const onRangeDragEnd = vi.fn();
    render(
      <CalendarDayCell
        date={date}
        events={[]}
        isCurrentMonth={true}
        onSelect={vi.fn()}
        onRangeDragStart={onRangeDragStart}
        onRangeDragEnter={onRangeDragEnter}
        onRangeDragEnd={onRangeDragEnd}
        isRangeSelecting={true}
      />
    );
    const cell = screen.getByRole("gridcell");
    fireEvent.mouseDown(cell);
    fireEvent.mouseEnter(cell);
    fireEvent.mouseUp(cell);
    expect(onRangeDragStart).toHaveBeenCalledWith(date);
    expect(onRangeDragEnter).toHaveBeenCalledWith(date);
    expect(onRangeDragEnd).toHaveBeenCalledWith(date);
  });

  it("renders selected state", () => {
    render(
      <CalendarDayCell
        date={date}
        events={[]}
        isCurrentMonth={true}
        isSelected={true}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("renders outside month", () => {
    render(<CalendarDayCell date={date} events={[]} isCurrentMonth={false} onSelect={vi.fn()} />);
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("today cell: glow class, info border, Today tag, info date badge", () => {
    render(
      <CalendarDayCell date={new Date()} events={[]} isCurrentMonth={true} onSelect={vi.fn()} />
    );
    const cell = screen.getByRole("gridcell");
    expect(cell.className).toContain("calendar-today-glow");
    expect(cell.className).toContain("border-info/40");
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText(String(new Date().getDate())).className).toContain("bg-info");
  });

  it("plain current-month cell shows + Book affordance (decorative)", () => {
    render(<CalendarDayCell date={date} events={[]} isCurrentMonth={true} onSelect={vi.fn()} />);
    const book = screen.getByText("+ Book");
    expect(book).toHaveAttribute("aria-hidden", "true");
    expect(book.className).toContain("pointer-events-none");
  });

  it("today cell does not show + Book", () => {
    render(
      <CalendarDayCell date={new Date()} events={[]} isCurrentMonth={true} onSelect={vi.fn()} />
    );
    expect(screen.queryByText("+ Book")).not.toBeInTheDocument();
  });

  it("weekend current-month plain cell is dimmed", () => {
    render(
      <CalendarDayCell
        date={new Date(2024, 5, 15)}
        events={[]}
        isCurrentMonth={true}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("gridcell").className).toContain("bg-surface-sunken/70");
  });

  it("prev-month cell uses sunken dim styling", () => {
    render(<CalendarDayCell date={date} events={[]} isCurrentMonth={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("gridcell").className).toContain("text-muted-foreground/60");
  });
});
