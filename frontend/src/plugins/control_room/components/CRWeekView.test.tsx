import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { format, startOfWeek, addDays } from "date-fns";
import { CRWeekView } from "./CRWeekView";
import type { ControlRoomRosterRow } from "../types";

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children, className }: any) => (
    <div data-testid="glass-card" className={className}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

// Build a roster row on a given day offset from this week's Monday.
const makeRow = (
  dayOffset: number,
  overrides: Partial<ControlRoomRosterRow> = {}
): ControlRoomRosterRow => {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const date = addDays(weekStart, dayOffset);
  return {
    id: Math.random(),
    date: format(date, "yyyy-MM-dd"),
    user_id: 10,
    user_name: "Alice",
    username: "alice",
    team_names: ["Alpha"],
    hours: 4,
    start_time: "08:00:00",
    end_time: "12:00:00",
    is_overnight: false,
    status: "approved",
    status_display: "Approved",
    description: "",
    ...overrides,
  };
};

describe("CRWeekView", () => {
  it("renders 7 weekday columns (Mon through Sun)", () => {
    // Need at least 1 roster row so the 7-column grid renders (empty
    // roster shows the empty-state card instead).
    const roster = [makeRow(0, { id: 1, user_name: "Alice" })];
    render(<CRWeekView roster={roster} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.getByText("Thu")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
  });

  it("shows empty state when roster is empty", () => {
    render(<CRWeekView roster={[]} />);
    expect(screen.getByText(/No standby scheduled this week/i)).toBeInTheDocument();
  });

  it("shows person names in the correct day column", () => {
    // Alice on Monday (offset 0), Bob on Wednesday (offset 2).
    const roster = [
      makeRow(0, { id: 1, user_name: "Alice", user_id: 10 }),
      makeRow(2, { id: 2, user_name: "Bob", user_id: 11 }),
    ];
    render(<CRWeekView roster={roster} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows person count badge for days with standby", () => {
    const roster = [makeRow(0, { id: 1, user_name: "Alice" })];
    render(<CRWeekView roster={roster} />);
    // Monday has 1 person — badge with "1". The day number "1" may also
    // appear (e.g. Saturday Aug 1), so use getAllByText.
    const ones = screen.getAllByText("1");
    expect(ones.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'No standby' for days with no entries", () => {
    const roster = [makeRow(0, { id: 1, user_name: "Alice" })];
    render(<CRWeekView roster={roster} />);
    // Only Monday has data; other days show "No standby"
    const noStandby = screen.getAllByText("No standby");
    expect(noStandby.length).toBe(6);
  });

  it("renders overnight moon icon for overnight shifts", () => {
    const roster = [makeRow(0, { id: 1, user_name: "Alice", is_overnight: true })];
    const { container } = render(<CRWeekView roster={roster} />);
    const moons = container.querySelectorAll(".lucide-moon");
    expect(moons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows team name badges in person cards", () => {
    const roster = [makeRow(0, { id: 1, user_name: "Alice", team_names: ["Alpha", "Beta"] })];
    render(<CRWeekView roster={roster} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("shows week summary header with total people count", () => {
    const roster = [
      makeRow(0, { id: 1, user_name: "Alice", user_id: 10 }),
      makeRow(1, { id: 2, user_name: "Bob", user_id: 11 }),
      makeRow(1, { id: 3, user_name: "Alice", user_id: 10 }), // same person, 2nd shift
    ];
    render(<CRWeekView roster={roster} />);
    // 2 unique people (Alice + Bob)
    expect(screen.getByText(/2 people on standby this week/i)).toBeInTheDocument();
  });

  it("filters out roster rows outside the current week", () => {
    // A row from 30 days ago — should not appear.
    const oldRow = makeRow(-30, { id: 99, user_name: "OldPerson" });
    const roster = [oldRow, makeRow(0, { id: 1, user_name: "Alice" })];
    render(<CRWeekView roster={roster} />);
    expect(screen.queryByText("OldPerson")).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("avatar initials use text-foreground, not text-primary (same failing tint pair as nav)", () => {
    const roster = [makeRow(0, { id: 1, user_name: "Alice" })];
    render(<CRWeekView roster={roster} />);
    const chip = screen.getByText("AL");
    expect(chip.className).toContain("text-foreground");
    expect(chip.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});
