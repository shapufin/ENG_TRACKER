import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EngagementMetricsPage } from "./EngagementMetricsPage";
import * as useEngagementMetrics from "./hooks/useEngagementMetrics";
import { engagementService } from "../services/engagementService";

vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  downloadBlobResponse: vi.fn(),
}));

// TeamBreakdownTable renders a DataTable (TanStack), which needs ResizeObserver —
// jsdom lacks it. Assertions below are unchanged.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const renderPage = () => render(<EngagementMetricsPage />, { wrapper: MemoryRouter });

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
  avg_tta_hours: 6,
  score_speed: 90,
  score_approval_rate: 90,
  score_responsiveness: 60,
  score_consistency: 80,
  decisions_during_leave: 0,
  decisions_on_holidays: 0,
  judgeable: 0,
  on_time: 0,
  breaches: 0,
  pending_past_deadline: 0,
  refreshed_on_read: false,
  computed_at: "2026-09-20T00:00:00Z",
};

const baseTrend = [
  {
    month: "2026-09",
    engagement_score: 78,
    avg_tta_hours: 6,
    decisions_during_leave: 0,
    decisions_on_holidays: 0,
    score_speed: 90,
    score_approval_rate: 90,
    score_responsiveness: 60,
    score_consistency: 80,
  },
];

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
        pending_past_deadline: 0,
        judgeable: 0,
        on_time: 0,
        breaches: 0,
        median_fraction: null,
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
        pending_past_deadline: 0,
        judgeable: 0,
        on_time: 0,
        breaches: 0,
        median_fraction: null,
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
        pending_past_deadline: 0,
        judgeable: 0,
        on_time: 0,
        breaches: 0,
        median_fraction: null,
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
    score_responsiveness: 60,
    score_consistency: 80,
    decisions_during_leave: 0,
    decisions_on_holidays: 0,
    next_deadline_at: null,
    computed_at: "2026-09-20T00:00:00Z",
  },
];

describe("EngagementMetricsPage", () => {
  it("renders loading state", () => {
    vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
      summary: undefined,
      trend: [],
      teamBreakdown: [],
      isLoading: true,
      isFetching: true,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders empty state when there are no teams", () => {
    vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
      summary: { ...baseSummary, team_count: 0 },
      trend: [],
      teamBreakdown: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByText("No engagement data yet")).toBeInTheDocument();
  });

  it("renders error state with retry", () => {
    const refetch = vi.fn();
    vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
      summary: undefined,
      trend: [],
      teamBreakdown: [],
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch,
    });

    renderPage();
    expect(screen.getByText("Couldn't load engagement metrics")).toBeInTheDocument();
  });

  it("renders summary cards, chart regions, and team breakdown table", () => {
    vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
      summary: baseSummary,
      trend: baseTrend,
      teamBreakdown: baseTeamBreakdown,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("Engagement Score")).toBeInTheDocument();
    expect(screen.getByText("Team Size")).toBeInTheDocument();
    expect(screen.getByText("Engagement Trend")).toBeInTheDocument();
    expect(screen.getByText("Approval Aging")).toBeInTheDocument();
    expect(screen.getByText("Score breakdown")).toBeInTheDocument();
    expect(screen.getByText("Engagement by team")).toBeInTheDocument();
    expect(screen.getByText("Team A")).toBeInTheDocument();
    expect(screen.getByText("Jane Leader")).toBeInTheDocument();
  });

  it("exposes the score status as a live region, never color alone", () => {
    vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
      summary: baseSummary,
      trend: baseTrend,
      teamBreakdown: baseTeamBreakdown,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole("status", { name: /watch/i })).toBeInTheDocument();
  });

  describe("control kit", () => {
    const mockMetrics = (trend = baseTrend) =>
      vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
        summary: baseSummary,
        trend,
        teamBreakdown: baseTeamBreakdown,
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      });

    it("renders the month picker with the shared Select trigger", () => {
      mockMetrics([...baseTrend, { ...baseTrend[0], month: "2026-08" }]);

      renderPage();

      const picker = screen.getByRole("combobox", { name: /snapshot month/i });
      expect(picker.tagName).toBe("BUTTON");
      expect(picker).toHaveTextContent(/september 2026/i);
    });

    it("filters teams through the shared SearchField (clearable)", () => {
      mockMetrics();

      renderPage();

      fireEvent.change(screen.getByRole("searchbox", { name: /filter teams/i }), {
        target: { value: "zzz" },
      });
      expect(screen.queryByText("Team A")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
      expect(screen.getByText("Team A")).toBeInTheDocument();
    });
  });

  describe("export menu", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ["Excel — this month", "month", "xlsx"],
      ["Excel — full year", "year", "xlsx"],
      ["PDF report — this month", "month", "pdf"],
      ["PDF report — full year", "year", "pdf"],
    ] as const)("%s requests the %s scope as %s", async (label, scope, fileFormat) => {
      const exportReport = vi
        .spyOn(engagementService, "exportReport")
        .mockResolvedValue({ data: new Blob(["x"]), headers: {} } as never);
      vi.mocked(useEngagementMetrics.useEngagementMetrics).mockReturnValue({
        summary: baseSummary,
        trend: baseTrend,
        teamBreakdown: baseTeamBreakdown,
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /export report/i }));
      fireEvent.click(await screen.findByRole("button", { name: label }));

      await waitFor(() =>
        expect(exportReport).toHaveBeenCalledWith("2026-09-01", scope, fileFormat)
      );
    });
  });
});
