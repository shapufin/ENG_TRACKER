import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamComparisonChart } from "./TeamComparisonChart";
import type { EngagementTeamBreakdownRow, EngagementTypeMetrics } from "../types/engagement";

const emptyType = (): EngagementTypeMetrics => ({
  submitted: 0,
  decided: 0,
  approved: 0,
  rejected: 0,
  avg_tta_hours: null,
  p50_tta_hours: null,
  p90_tta_hours: null,
  aging: { "<4h": 0, "4-24h": 0, "1-3d": 0, ">3d": 0 },
  pending_over_48h: 0,
  resubmission_count: 0,
});

const row = (overrides: Partial<EngagementTeamBreakdownRow> = {}): EngagementTeamBreakdownRow => ({
  id: 1,
  leader: 1,
  leader_name: "Jane Leader",
  team: 1,
  team_name: "Team A",
  month: "2026-09-01",
  metrics: { leave: emptyType(), overtime: emptyType(), standby: emptyType() },
  team_size: 5,
  active_submitters: 3,
  approval_rate_pct: 90,
  resubmission_count: 0,
  engagement_score: 78,
  score_speed: 90,
  score_approval_rate: 90,
  score_activity: 60,
  score_consistency: 80,
  decisions_during_leave: 0,
  computed_at: "2026-09-20T00:00:00Z",
  is_stale: false,
  ...overrides,
});

describe("TeamComparisonChart", () => {
  it("renders an empty state with no rows", () => {
    render(<TeamComparisonChart rows={[]} />);
    expect(screen.getByText("No team data yet")).toBeInTheDocument();
  });

  it("renders the chart instead of the empty state with rows present", () => {
    render(
      <TeamComparisonChart
        rows={[row({ team_name: "Team A" }), row({ id: 2, team_name: "Team B", engagement_score: 60 })]}
      />
    );
    expect(screen.queryByText("No team data yet")).not.toBeInTheDocument();
  });
});
