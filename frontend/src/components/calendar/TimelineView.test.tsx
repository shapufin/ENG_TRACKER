import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimelineView } from "./TimelineView";
import type { CalendarEvent } from "./types";
import type { User } from "@/types";

const mockUsers: User[] = [
  {
    id: 101,
    username: "alice",
    first_name: "Alice",
    last_name: "Smith",
    email: "alice@example.com",
  } as User,
  {
    id: 102,
    username: "bob",
    first_name: "Bob",
    last_name: "Jones",
    email: "bob@example.com",
  } as User,
];

const mockEvents: CalendarEvent[] = [
  {
    id: "evt-1",
    title: "Vacation Alice",
    start: "2026-11-05T00:00:00Z",
    end: "2026-11-08T23:59:59Z",
    type: "vacation",
    status: "approved",
    userId: 101,
    compactLabel: "Alice V",
  },
];

describe("TimelineView", () => {
  it("renders member rows and timeline header for November (30 days)", () => {
    const novDate = new Date("2026-11-01T00:00:00Z");
    render(
      <TimelineView
        currentMonth={novDate}
        users={mockUsers}
        events={mockEvents}
        onUserClick={vi.fn()}
        onEventActivate={vi.fn()}
      />
    );

    expect(screen.getByTestId("timeline-view")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument(); // day 30 exists
    expect(screen.queryByText("31")).not.toBeInTheDocument(); // day 31 does not exist in November
  });

  it("dynamically adjusts columns for 31-day months (December)", () => {
    const decDate = new Date("2026-12-01T00:00:00Z");
    render(<TimelineView currentMonth={decDate} users={mockUsers} events={mockEvents} />);

    expect(screen.getByText("31")).toBeInTheDocument(); // day 31 exists in December
  });

  it("calls onEventActivate when clicking an active leave cell", () => {
    const novDate = new Date("2026-11-01T00:00:00Z");
    const onActivate = vi.fn();
    render(
      <TimelineView
        currentMonth={novDate}
        users={mockUsers}
        events={mockEvents}
        onEventActivate={onActivate}
      />
    );

    const vacationCells = screen.getAllByText("V");
    expect(vacationCells.length).toBeGreaterThan(0);
    fireEvent.click(vacationCells[0]);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "evt-1" }));
  });

  it("exposes event cells and member names as keyboard-reachable buttons", () => {
    const onActivate = vi.fn();
    const onUser = vi.fn();
    render(
      <TimelineView
        currentMonth={new Date("2026-11-01T00:00:00Z")}
        users={mockUsers}
        events={mockEvents}
        onUserClick={onUser}
        onEventActivate={onActivate}
      />
    );

    // Nov 5-8 inclusive is four cells for Alice.
    const eventButtons = screen.getAllByRole("button", { name: /Alice Smith: Vacation Alice/ });
    expect(eventButtons).toHaveLength(4);
    fireEvent.click(eventButtons[0]);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "evt-1" }));

    fireEvent.click(screen.getByRole("button", { name: /View Alice Smith/ }));
    expect(onUser).toHaveBeenCalledWith(101);

    // Empty cells are not interactive.
    expect(screen.queryByRole("button", { name: /Bob Jones:/ })).not.toBeInTheDocument();
  });

  it("keeps the member column pinned while the days scroll", () => {
    render(
      <TimelineView
        currentMonth={new Date("2026-11-01T00:00:00Z")}
        users={mockUsers}
        events={mockEvents}
      />
    );

    const memberCell = screen.getByRole("button", { name: /View Alice Smith/ }).parentElement;
    expect(memberCell?.className).toContain("sticky");
    expect(memberCell?.className).toContain("left-0");
    expect(screen.getByText("Team Member").className).toContain("sticky");
    // The title/legend strip must not scroll away with the days either.
    const strip = screen.getByText(/Team Schedule/).parentElement?.parentElement;
    expect(strip?.className).toContain("sticky");
    expect(strip?.className).toContain("left-0");
  });

  it("marks today on the business clock (Europe/Tirane), not the browser clock", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles"; // browser clock: still Nov 2
    vi.useFakeTimers();
    // 23:30 UTC on Nov 2 is already Nov 3 in Tirane.
    vi.setSystemTime(new Date("2026-11-02T23:30:00Z"));
    try {
      render(
        <TimelineView currentMonth={new Date(2026, 10, 15)} users={mockUsers} events={[]} />
      );
      expect(screen.getByText("3").parentElement?.className).toContain("bg-primary");
      expect(screen.getByText("2").parentElement?.className).not.toContain("bg-primary");
    } finally {
      vi.useRealTimers();
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it("uses tone tokens, a legend and no raw palette or dark overrides", () => {
    const { container } = render(
      <TimelineView
        currentMonth={new Date("2026-11-01T00:00:00Z")}
        users={mockUsers}
        events={mockEvents}
      />
    );

    expect(container.innerHTML).not.toMatch(/emerald|rose-|amber-|sky-|dark:/);
    expect(container.innerHTML).toContain("tone-success");
    expect(screen.getByText("Vacation")).toBeInTheDocument();
    expect(screen.getByText("Sick")).toBeInTheDocument();
    expect(screen.getByText("Standby")).toBeInTheDocument();
  });
});
