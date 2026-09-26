import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { TLScorecardVisualizationPage } from "./TLScorecardVisualizationPage";
import { tlScorecardService } from "../services/tlScorecardService";
import type { Scorecard } from "../types/tlScorecard";

vi.mock("../services/tlScorecardService", () => ({
  tlScorecardService: {
    getTrend: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "leader", full_name: "Leader One" } }),
}));

const point = (month: string, teamSize: number): Scorecard => ({
  month,
  team_size: teamSize,
  leave: { decided_count: 2, pct_within_2_days: 80, pending_at_month_end: 0 },
  overtime: { decided_count: 1, avg_turnaround_days: 1.2 },
  meetings: {
    one_on_one_compliance_pct: 100,
    tl_sync_count: 1,
    team_meetings_held: 1,
    team_meetings_with_hrbp: 1,
    team_meeting_notes_within_24h: 1,
  },
  idle: { open_count: 0, resolved_count: 0 },
  review_deliveries_ytd: 1,
  seniority: { junior: 1, mid: 1, senior: 0, unset: 0 },
  absences: { open_count: 0, breached_5_day_sla: 0 },
  pip: { active_count: 0, pending_approval_count: 0 },
  promotion: { promoted_count: 0, team_size: teamSize, promoted_pct: 0, target_pct: 3 },
  escalation_count: 0,
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TLScorecardVisualizationPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("TLScorecardVisualizationPage", () => {
  it("renders an empty state when the team has no activity", async () => {
    (tlScorecardService.getTrend as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [point("2026-04-01", 0), point("2026-05-01", 0)],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("No team data yet")).toBeInTheDocument());
  });

  it("renders an error card when the trend fetch fails", async () => {
    (tlScorecardService.getTrend as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));

    renderPage();

    await waitFor(() => expect(screen.getByText("Couldn't load visualization data")).toBeInTheDocument());
  });

  it("renders all chart sections and export/back controls once data loads", async () => {
    (tlScorecardService.getTrend as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [point("2026-04-01", 4), point("2026-05-01", 4)],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("Leave SLA")).toBeInTheDocument());
    expect(screen.getByText("Overtime Turnaround")).toBeInTheDocument();
    expect(screen.getByText("Escalation Risks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to scorecard/i })).toBeInTheDocument();
  });
});
