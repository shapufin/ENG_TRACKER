import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { HbprDashboardPage } from "./HbprDashboardPage";
import { tlScorecardService } from "../services/tlScorecardService";
import type { HbprOverview } from "../types/tlScorecard";

vi.mock("../services/tlScorecardService", () => ({
  tlScorecardService: { getHbprOverview: vi.fn() },
}));

const overview = vi.mocked(tlScorecardService.getHbprOverview);

const DATA: HbprOverview = {
  reporting_year: 2026,
  recent_evidence_days: 7,
  needs_attention: {
    cadence_overdue: 2,
    cadence_due: 1,
    missing_mid_year_evidence: 1,
    missing_year_end_evidence: 2,
    recent_evidence: 3,
  },
  leaders: [
    {
      id: 7,
      name: "Alb TL",
      assignment_id: 1,
      cadence: "weekly",
      team_size: 5,
      last_meeting_on: null,
      next_due_on: null,
      cadence_status: "not_started",
      epr_mid_year: false,
      epr_year_end: false,
      evidence_count: 0,
      last_evidence_on: null,
    },
  ],
};

const ok = (data: HbprOverview) => ({ data }) as never;

const renderWidget = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <HbprDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe("HbprDashboardPage (dashboard widget)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    overview.mockResolvedValue(ok(DATA));
  });

  it("summarises the workspace and links to it instead of duplicating the page", async () => {
    renderWidget();
    expect(await screen.findByText("Assigned team leaders")).toBeInTheDocument();
    expect(screen.getByText("Cadence overdue")).toBeInTheDocument();
    // missing mid-year (1) + missing year-end (2)
    expect(screen.getByText("EPR evidence missing")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open hbpr workspace/i })).toHaveAttribute(
      "href",
      "/hbpr"
    );
  });

  it("shows no-access for a 403", async () => {
    overview.mockRejectedValue({ response: { status: 403 } });
    renderWidget();
    expect(await screen.findByText("You do not have access to this")).toBeInTheDocument();
  });

  it("shows a retryable error otherwise", async () => {
    overview.mockRejectedValueOnce(new Error("boom"));
    renderWidget();
    expect(await screen.findByText("Could not load the HBPR summary")).toBeInTheDocument();
  });
});
