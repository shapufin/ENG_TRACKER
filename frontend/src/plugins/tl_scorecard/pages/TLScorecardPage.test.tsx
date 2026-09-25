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
  },
}));

vi.mock("@/plugins/engagement/services/engagementService", () => ({
  engagementService: {
    getSummary: vi.fn(),
  },
}));

const SCORECARD: Scorecard = {
  month: "2026-09-01",
  team_size: 4,
  leave: { decided_count: 3, pct_within_2_days: 66.7, pending_at_month_end: 1 },
  overtime: { decided_count: 2, avg_turnaround_days: 1.5 },
};

const COVERAGE: KpiCoverageEntry[] = [
  { kpi: "Leave requests decided within 2 working days", sheet: 2, status: "measured", phase: 1, note: "n/a" },
  { kpi: "Regretted voluntary turnover < 7%", sheet: 1, status: "blocked", phase: 3, note: "needs HR taxonomy" },
];

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
    (tlScorecardService.getScorecard as ReturnType<typeof vi.fn>).mockResolvedValue({ data: SCORECARD });
    (tlScorecardService.getKpiCoverage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: COVERAGE });
    (engagementService.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { engagement_score: 82 },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("66.7%")).toBeInTheDocument());
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("1.5d")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("labels the approval-behavior engagement score as a proxy, not the sentiment KPI", async () => {
    (tlScorecardService.getScorecard as ReturnType<typeof vi.fn>).mockResolvedValue({ data: SCORECARD });
    (tlScorecardService.getKpiCoverage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: COVERAGE });
    (engagementService.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { engagement_score: 82 },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("8.2/10")).toBeInTheDocument());
    expect(screen.getByText(/not yet measurable/i)).toBeInTheDocument();
  });

  it("renders the KPI coverage panel with every entry's status", async () => {
    (tlScorecardService.getScorecard as ReturnType<typeof vi.fn>).mockResolvedValue({ data: SCORECARD });
    (tlScorecardService.getKpiCoverage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: COVERAGE });
    (engagementService.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { engagement_score: null },
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Leave requests decided within 2 working days")).toBeInTheDocument()
    );
    expect(screen.getByText("Regretted voluntary turnover < 7%")).toBeInTheDocument();
    expect(screen.getByText("Measured")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("shows an error card when the scorecard fetch fails", async () => {
    (tlScorecardService.getScorecard as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    (tlScorecardService.getKpiCoverage as ReturnType<typeof vi.fn>).mockResolvedValue({ data: COVERAGE });
    (engagementService.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderPage();

    await waitFor(() => expect(screen.getByText("Couldn't load your scorecard")).toBeInTheDocument());
  });
});
