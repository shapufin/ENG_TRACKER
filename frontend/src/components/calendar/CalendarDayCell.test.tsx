import { describe, it, expect, vi, afterEach } from "vitest";
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

  it("weekend current-month plain cell uses the same clean background as weekdays, not a dimmed gray shade", () => {
    render(
      <CalendarDayCell
        date={new Date(2024, 5, 15)}
        events={[]}
        isCurrentMonth={true}
        onSelect={vi.fn()}
      />
    );
    const className = screen.getByRole("gridcell").className;
    expect(className).toContain("bg-card");
    expect(className).not.toContain("surface-sunken");
  });

  it("prev-month cell uses sunken dim styling", () => {
    render(<CalendarDayCell date={date} events={[]} isCurrentMonth={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("gridcell").className).toContain("text-muted-foreground/60");
  });

  it("compact density shows 3 event slots before overflowing", () => {
    const onSelect = vi.fn();
    render(
      <CalendarDayCell
        date={date}
        events={events}
        isCurrentMonth={true}
        density="compact"
        onSelect={onSelect}
      />
    );
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("E2")).toBeInTheDocument();
    expect(screen.getByText("E3")).toBeInTheDocument();
    expect(screen.queryByText(/\+.*more/)).not.toBeInTheDocument();
  });

  it("clicking the overflow button triggers onSelect for that day", () => {
    const onSelect = vi.fn();
    render(
      <CalendarDayCell
        date={date}
        events={events}
        isCurrentMonth={true}
        density="normal"
        onSelect={onSelect}
      />
    );
    const overflowBtn = screen.getByRole("button", { name: /view 1 more events/i });
    fireEvent.click(overflowBtn);
    expect(onSelect).toHaveBeenCalledWith(date);
  });

  describe("today marker", () => {
    afterEach(() => vi.useRealTimers());

    it("marks the Tirane business day, not the browser day", () => {
      const originalTz = process.env.TZ;
      process.env.TZ = "America/Los_Angeles"; // browser still on Nov 2
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-02T23:30:00Z")); // Nov 3 in Tirane
      try {
        const { container, rerender } = render(
          <CalendarDayCell
            date={new Date(2026, 10, 3)}
            events={[]}
            isCurrentMonth={true}
            onSelect={vi.fn()}
          />
        );
        expect(container.querySelector(".calendar-today-glow")).not.toBeNull();
        rerender(
          <CalendarDayCell
            date={new Date(2026, 10, 2)}
            events={[]}
            isCurrentMonth={true}
            onSelect={vi.fn()}
          />
        );
        expect(container.querySelector(".calendar-today-glow")).toBeNull();
      } finally {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
      }
    });
  });

  describe("staffing conflict", () => {
    const conflict = { dateKey: "2024-01-15", coveragePct: 50, away: 2, total: 4, users: [] };

    it("shows the coverage badge and a warning outline on a conflict day", () => {
      const { container } = render(
        <CalendarDayCell
          date={date}
          events={[]}
          isCurrentMonth={true}
          onSelect={vi.fn()}
          conflict={conflict}
        />
      );
      const badge = screen.getByLabelText("Staffing conflict: 2 of 4 away, 50% coverage");
      expect(badge).toHaveTextContent("50%");
      expect(screen.getByRole("gridcell").className).toContain("tone-warning");
      expect(container.querySelector("svg")).not.toBeNull();
    });

    it("drops the figure, not the badge, when the cell is too narrow to hold it", () => {
      render(
        <CalendarDayCell
          date={date}
          events={[]}
          isCurrentMonth={true}
          onSelect={vi.fn()}
          conflict={conflict}
        />
      );
      expect(screen.getByRole("gridcell").className).toContain("@container");
      expect(screen.getByText("50%").className).toContain("@[5rem]:inline");
      expect(screen.getByText("50%").className).toContain("hidden");
    });

    it("shows nothing extra on a normal day", () => {
      render(<CalendarDayCell date={date} events={[]} isCurrentMonth={true} onSelect={vi.fn()} />);
      expect(screen.queryByLabelText(/staffing conflict/i)).toBeNull();
      expect(screen.getByRole("gridcell").className).not.toContain("tone-warning");
    });
  });

  it("tints weekends of the current month so working days read first", () => {
    const sat = new Date(2024, 0, 13);
    const mon = new Date(2024, 0, 15);
    const { rerender } = render(
      <CalendarDayCell date={sat} events={[]} isCurrentMonth={true} onSelect={vi.fn()} />
    );
    expect(screen.getByRole("gridcell").className).toContain("bg-muted/30");
    rerender(<CalendarDayCell date={mon} events={[]} isCurrentMonth={true} onSelect={vi.fn()} />);
    expect(screen.getByRole("gridcell").className).not.toContain("bg-muted/30");
  });
});
