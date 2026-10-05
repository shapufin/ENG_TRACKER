import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TeamBreakdownTable } from "./TeamBreakdownTable";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

// DataTable (TanStack) needs ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const ROW = {
  id: 1,
  leader: 7,
  leader_name: "Alba Leader",
  team: 3,
  team_name: "E2E Team A",
  month: "2026-10-01",
  metrics: {
    leave: { pending_over_48h: 2 },
    overtime: { pending_over_48h: 3 },
    standby: { pending_over_48h: 4 },
  },
  team_size: 5,
  active_submitters: 4,
  approval_rate_pct: 82.4,
  resubmission_count: 6,
  engagement_score: 71.6,
  score_speed: null,
  score_approval_rate: null,
  score_activity: null,
  score_consistency: null,
  decisions_during_leave: 2,
  computed_at: "2026-10-05T10:00:00Z",
  is_stale: false,
} as unknown as EngagementTeamBreakdownRow;

const STALE_ROW = {
  ...ROW,
  id: 2,
  team_name: "E2E Team B",
  is_stale: true,
} as unknown as EngagementTeamBreakdownRow;

describe("TeamBreakdownTable", () => {
  it("renders the engagement metrics as a data grid", () => {
    render(<TeamBreakdownTable rows={[ROW]} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("E2E Team A")).toBeInTheDocument();
    expect(within(table).getByText("Alba Leader")).toBeInTheDocument();
    // Score and approval rate are rounded, approval gets a % suffix.
    expect(within(table).getByText("72")).toBeInTheDocument();
    expect(within(table).getByText("82%")).toBeInTheDocument();
    expect(within(table).getByText("6")).toBeInTheDocument();
    // Pending >48h is the sum across leave + overtime + standby.
    expect(within(table).getByText("9")).toBeInTheDocument();
  });

  it("shows the snapshot-freshness and decisions-during-leave status pills", () => {
    render(<TeamBreakdownTable rows={[ROW, STALE_ROW]} />);

    expect(screen.getByRole("status", { name: "Fresh snapshot" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Stale snapshot" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("status", { name: /approved 2 request\(s\) while on leave/i })
    ).toHaveLength(2);
  });

  it("omits the decisions pill when there were none", () => {
    render(<TeamBreakdownTable rows={[{ ...ROW, decisions_during_leave: 0 }]} />);

    expect(screen.queryByRole("status", { name: /while on leave/i })).not.toBeInTheDocument();
  });

  it("renders an em dash for a null score instead of NaN", () => {
    render(<TeamBreakdownTable rows={[{ ...ROW, engagement_score: null }]} />);

    expect(screen.getByRole("table")).toHaveTextContent("—");
  });

  it("shows the empty state and no table when there are no rows", () => {
    render(<TeamBreakdownTable rows={[]} />);

    expect(screen.getByText(/no teams to show/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("adds no search box (searchColumn is deliberately omitted)", () => {
    render(<TeamBreakdownTable rows={[ROW]} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
