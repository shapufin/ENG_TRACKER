import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { TLScorecardPage } from "./TLScorecardPage";
import { tlScorecardService } from "../services/tlScorecardService";
import { engagementService } from "@/plugins/engagement/services/engagementService";
import type { KpiCoverageEntry, Scorecard } from "../types/tlScorecard";

vi.mock("../services/tlScorecardService", () => ({
  tlScorecardService: {
    getScorecard: vi.fn(),
    getKpiCoverage: vi.fn(),
    getEngagementSurveyTeamAverage: vi.fn(),
  },
}));

vi.mock("@/plugins/engagement/services/engagementService", () => ({
  engagementService: {
    getSummary: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "leader", teams: [] } }),
}));

vi.mock("@/services/userService", () => ({
  userService: {
    getMyTeamMembers: vi.fn().mockResolvedValue([]),
  },
}));

const SCORECARD: Scorecard = {
  month: "2026-09-01",
  team_size: 4,
  leave: { decided_count: 3, pct_within_2_days: 66.7, pending_at_month_end: 1 },
  overtime: { decided_count: 2, avg_turnaround_days: 1.5 },
  meetings: {
    one_on_one_compliance_pct: 75,
    tl_sync_count: 3,
    team_meetings_held: 1,
    team_meetings_with_hrbp: 1,
    team_meeting_notes_within_24h: 1,
  },
  idle: { open_count: 1, resolved_count: 2 },
  review_deliveries_ytd: 5,
  seniority: { junior: 1, mid: 2, senior: 1, unset: 0 },
};

const COVERAGE: KpiCoverageEntry[] = [
  { kpi: "Leave requests decided within 2 working days", sheet: 2, status: "measured", phase: 1, note: "n/a" },
  { kpi: "Regretted voluntary turnover < 7%", sheet: 1, status: "blocked", phase: 3, note: "needs HR taxonomy" },
];

const mockDefaults = () => {
  (tlScorecardService.getScorecard as ReturnType<typeof vi.fn>).mockResolvedValue({ data: SCORECARD });
  (tlScorecardService.getKpiCoverage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: COVERAGE });
  (tlScorecardService.getEngagementSurveyTeamAverage as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { period: "2026-09", average_score: null, response_count: 0 },
  });
  (engagementService.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { engagement_score: 82 },
  });
};

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TLScorecardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("TLScorecardPage", () => {
  it("renders leave SLA, pending count, and OT turnaround from the scorecard endpoint", async () => {
    mockDefaults();

    renderPage();

    await waitFor(() => expect(screen.getByText("66.7%")).toBeInTheDocument());
    expect(screen.getByText("1.5d")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("labels the approval-behavior engagement score as a proxy, not the sentiment KPI", async () => {
    mockDefaults();

    renderPage();

    await waitFor(() => expect(screen.getByText("8.2/10")).toBeInTheDocument());
    expect(screen.getByText(/No pulse-survey responses yet/i)).toBeInTheDocument();
  });

  it("shows the real pulse-survey average once responses exist", async () => {
    mockDefaults();
    (tlScorecardService.getEngagementSurveyTeamAverage as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { period: "2026-09", average_score: 8.7, response_count: 3 },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("8.7/10")).toBeInTheDocument());
    expect(screen.getByText(/3 response\(s\)/)).toBeInTheDocument();
  });

  it("renders meeting compliance, idle, and review-delivery metrics", async () => {
    mockDefaults();

    renderPage();

    await waitFor(() => expect(screen.getByText("75%")).toBeInTheDocument());
    expect(screen.getByText("3")).toBeInTheDocument(); // TL-Italy syncs
    expect(screen.getByText("1/1")).toBeInTheDocument(); // team meetings with HRBP
    expect(screen.getByText("5")).toBeInTheDocument(); // review deliveries YTD
  });

  it("renders the KPI coverage panel with every entry's status", async () => {
    mockDefaults();

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Leave requests decided within 2 working days")).toBeInTheDocument()
    );
    expect(screen.getByText("Regretted voluntary turnover < 7%")).toBeInTheDocument();
    expect(screen.getByText("Measured")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("shows an error card when the scorecard fetch fails", async () => {
    mockDefaults();
    (tlScorecardService.getScorecard as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));

    renderPage();

    await waitFor(() => expect(screen.getByText("Couldn't load your scorecard")).toBeInTheDocument());
  });
});
