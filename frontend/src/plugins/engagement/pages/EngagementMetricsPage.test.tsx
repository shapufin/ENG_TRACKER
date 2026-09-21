import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EngagementMetricsPage } from "./EngagementMetricsPage";
import * as useEngagementMetrics from "./hooks/useEngagementMetrics";

vi.mock("./hooks/useEngagementMetrics", () => ({
  useEngagementMetrics: vi.fn(),
}));

const baseSummary = {
  month: "2026-09-01",
  team_count: 1,
  team_size: 5,
  active_submitters: 3,
  approval_rate_pct: 90,
  resubmission_count: 1,
  engagement_score: 78,
  is_stale: false,
  computed_at: "2026-09-20T00:00:00Z",
};

const baseTrend = [{ month: "2026-09", engagement_score: 78, avg_tta_hours: 6 }];

const baseTeamBreakdown = [
  {
    id: 1,
    leader: 1,
    leader_name: "Jane Leader",
    team: 1,
    team_name: "Team A",
    month: "2026-09-01",
    metrics: {
      leave: {
        submitted: 2,
        decided: 2,
        approved: 2,
        rejected: 0,
        avg_tta_hours: 5,
        p50_tta_hours: 5,
        p90_tta_hours: 5,
        aging: { "<4h": 1, "4-24h": 1, "1-3d": 0, ">3d": 0 },
        pending_over_48h: 0,
        resubmission_count: 0,
      },
      overtime: {
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
      },
      standby: {
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
      },
    },
    team_size: 5,
    active_submitters: 3,
    approval_rate_pct: 90,
    resubmission_count: 1,
    engagement_score: 78,
    score_speed: 90,
    score_approval_rate: 90,
    score_activity: 60,
    score_consistency: 80,
    computed_at: "2026-09-20T00:00:00Z",
    is_stale: false,
  },
];

describe("EngagementMetricsPage", () => {
  it("renders loading state", () => {
    vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
      summary: undefined,
      trend: [],
      teamBreakdown: [],
      isLoading: true,
      isError: false,
    });

    render(<EngagementMetricsPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders empty state when there are no teams", () => {
    vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
      summary: { ...baseSummary, team_count: 0 },
      trend: [],
      teamBreakdown: [],
      isLoading: false,
      isError: false,
    });

    render(<EngagementMetricsPage />);
    expect(screen.getByText("No engagement data yet")).toBeInTheDocument();
  });

  it("renders summary cards, chart regions, and team breakdown table", () => {
    vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
      summary: baseSummary,
      trend: baseTrend,
      teamBreakdown: baseTeamBreakdown,
      isLoading: false,
      isError: false,
    });

    render(<EngagementMetricsPage />);

    expect(screen.getByText("Engagement Score")).toBeInTheDocument();
    expect(screen.getByText("Team Size")).toBeInTheDocument();
    expect(screen.getByText("Engagement Trend")).toBeInTheDocument();
    expect(screen.getByText("Approval Aging")).toBeInTheDocument();
    expect(screen.getByText("Team A")).toBeInTheDocument();
    expect(screen.getByText("Jane Leader")).toBeInTheDocument();
  });
});
