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
    getEprProgress: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "leader", full_name: "Leader One" } }),
}));

const perms = vi.hoisted(() => ({ value: { isHBPROnly: false } as Record<string, boolean> }));
vi.mock("@/context/PermissionContext", () => ({ usePermissions: () => perms.value }));

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

const eprProgress = {
  stages: {
    goal_setting: { due_date: "2026-03-31", completed_on_time: 1, team_size: 4, pct_on_time: 25 },
    mid_year: { due_date: "2026-09-30", completed_on_time: 2, team_size: 4, pct_on_time: 50 },
    final_review: { due_date: "2026-12-31", completed_on_time: 0, team_size: 4, pct_on_time: 0 },
  },
  cycles_with_5plus_goals: 1,
  cycles_started: 2,
  stages_completed: 3,
  stages_with_evidence: 1,
};

const mockTrend = (data: Scorecard[]) =>
  (tlScorecardService.getTrend as ReturnType<typeof vi.fn>).mockResolvedValue({ data });

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

    await waitFor(() =>
      expect(screen.getByText("Couldn't load visualization data")).toBeInTheDocument()
    );
  });

  it("renders the governance chart sections and export/back controls once data loads", async () => {
    mockTrend([point("2026-04-01", 4), point("2026-05-01", 4)]);
    (tlScorecardService.getEprProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: eprProgress,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "This month at a glance" })).toBeInTheDocument()
    );
    for (const title of [
      "Meeting cadence",
      "1:1 compliance",
      "Meeting notes within 24h",
      "Review deliveries vs target",
      "Team risk snapshot (now)",
      "Seniority mix",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /EPR stage progress/ })).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /export pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to scorecard/i })).toBeInTheDocument();
  });

  it("no longer charts the retired SLA, turnaround or escalation sections", async () => {
    mockTrend([point("2026-04-01", 4), point("2026-05-01", 4)]);
    (tlScorecardService.getEprProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: eprProgress,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Meeting cadence" })).toBeInTheDocument()
    );
    expect(screen.queryByText("Leave SLA")).not.toBeInTheDocument();
    expect(screen.queryByText("Overtime Turnaround")).not.toBeInTheDocument();
    expect(screen.queryByText("Escalation Risks")).not.toBeInTheDocument();
  });

  it("shows an error inside the EPR section when its fetch fails, not a silent gap", async () => {
    mockTrend([point("2026-04-01", 4), point("2026-05-01", 4)]);
    (tlScorecardService.getEprProgress as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom")
    );

    renderPage();

    expect(await screen.findByText("Couldn't load EPR progress")).toBeInTheDocument();
    expect(screen.getByText(/EPR stage progress/)).toBeInTheDocument();
  });

  it("omits the 1:1 compliance section when every point is masked", async () => {
    const masked = (month: string) => {
      const p = point(month, 4);
      p.meetings.one_on_one_compliance_pct = null;
      return p;
    };
    mockTrend([masked("2026-04-01"), masked("2026-05-01")]);
    (tlScorecardService.getEprProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: eprProgress,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Meeting cadence" })).toBeInTheDocument()
    );
    expect(screen.queryByRole("heading", { name: "1:1 compliance" })).not.toBeInTheDocument();
    expect(screen.queryByText("1:1 compliance %")).not.toBeInTheDocument();
  });

  it("sends an HBPR-only viewer to their own workspace without calling the trend API", async () => {
    perms.value = { isHBPROnly: true };
    renderPage();

    await waitFor(() => expect(screen.queryByText("Leave SLA")).not.toBeInTheDocument());
    expect(tlScorecardService.getTrend).not.toHaveBeenCalled();
    perms.value = { isHBPROnly: false };
  });
});
