import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CurrentStandbyRoster } from "./CurrentStandbyRoster";
import { rosterColumns } from "./CurrentStandbyRosterColumns";
import type { ControlRoomRosterRow } from "../types";

// Mock DataTable so jsdom doesn't choke on TanStack table internals.
vi.mock("@/components/ui/DataTable", () => ({
  DataTable: ({ data, columns }: any) => (
    <div data-testid="data-table">
      {data.map((row: any) => (
        <div key={row.id} data-testid="roster-row">
          <span data-testid="user-name">{row.user_name}</span>
          <span data-testid="shift-count">{row.shift_count}</span>
        </div>
      ))}
      {/* Render column headers so tests can find them */}
      <div data-testid="column-headers">
        {columns.map((col: any) => (
          <span key={col.id ?? col.accessorKey} data-testid={`col-${col.id ?? col.accessorKey}`}>
            {typeof col.header === "string" ? col.header : (col.id ?? col.accessorKey)}
          </span>
        ))}
      </div>
    </div>
  ),
}));

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: any) => <div data-testid="glass-card">{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

const mockRoster: ControlRoomRosterRow[] = [
  {
    id: 1,
    date: "2026-07-05",
    user_id: 10,
    user_name: "Alice Smith",
    username: "asmith",
    team_names: ["Platform", "Infra"],
    hours: 4,
    start_time: "22:00:00",
    end_time: "06:00:00",
    is_overnight: true,
    status: "approved",
    status_display: "Approved",
    description: "Night coverage",
  },
  {
    id: 2,
    date: "2026-07-06",
    user_id: 10,
    user_name: "Alice Smith",
    username: "asmith",
    team_names: ["Platform"],
    hours: 4,
    start_time: "22:00:00",
    end_time: "06:00:00",
    is_overnight: true,
    status: "approved",
    status_display: "Approved",
    description: "Night coverage",
  },
  {
    id: 3,
    date: "2026-07-20",
    user_id: 11,
    user_name: "Bob Jones",
    username: "bjones",
    team_names: ["Support"],
    hours: 8,
    start_time: "09:00:00",
    end_time: "17:00:00",
    is_overnight: false,
    status: "approved",
    status_display: "Approved",
    description: "Day shift",
  },
];

describe("CurrentStandbyRoster", () => {
  it("renders empty state when roster is empty", () => {
    render(<CurrentStandbyRoster roster={[]} />);
    expect(screen.getByText("No standby entries for the selected period.")).toBeInTheDocument();
  });

  it("renders aggregated rows (one per user, not per shift)", () => {
    render(<CurrentStandbyRoster roster={mockRoster} />);
    const rows = screen.getAllByTestId("roster-row");
    // 2 unique users (Alice has 2 shifts, Bob has 1) → 2 aggregated rows
    expect(rows).toHaveLength(2);
  });

  it("renders user names", () => {
    render(<CurrentStandbyRoster roster={mockRoster} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("aggregates shift count per user", () => {
    render(<CurrentStandbyRoster roster={mockRoster} />);
    // Alice has 2 shifts, Bob has 1
    const counts = screen.getAllByTestId("shift-count").map((e) => e.textContent);
    expect(counts).toContain("2");
    expect(counts).toContain("1");
  });

  it("does NOT render a Total Hours column (CR users need days, not hours)", () => {
    render(<CurrentStandbyRoster roster={mockRoster} />);
    // The column header should not include "Total Hours".
    const headers = screen.getAllByTestId(/col-/).map((e) => e.textContent);
    expect(headers).not.toContain("Total Hours");
  });

  it("avatar initials use text-foreground, not text-primary (same failing tint pair as nav)", () => {
    // DataTable is mocked in this file, so the person cell is rendered
    // directly from the exported column def.
    const personCol = rosterColumns.find((c: any) => c.accessorKey === "user_name") as any;
    expect(personCol?.cell).toBeTruthy();
    const cell = personCol.cell as (ctx: any) => React.ReactNode;
    const { container } = render(
      cell({ row: { original: { user_name: "Alice Smith", has_overnight: false } } })
    );
    const chip = container.querySelector("span > span");
    expect(chip?.textContent).toBe("AS");
    expect(chip?.className).toContain("text-foreground");
    expect(chip?.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});
