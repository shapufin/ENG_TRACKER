import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TeamTab } from "./TeamTab";
import { tlScorecardService } from "../../services/tlScorecardService";
import type { TeamMemberSummary } from "../../types/tlScorecard";

vi.mock("../../services/tlScorecardService", () => ({
  tlScorecardService: {
    getTeamMembers: vi.fn(),
  },
}));

const MEMBER: TeamMemberSummary = {
  id: 7,
  full_name: "Bora Zeta",
  username: "bora",
  email: "bora@example.com",
  seniority_level: "mid",
  wage: { gross_monthly: "150000.00", effective_from: "2026-01-01", status: "ok" },
  leave: {
    total_days: "20.0",
    used_days: "5.0",
    pending_days: "2.0",
    available_days: "13.0",
    upcoming: [
      {
        start_date: "2026-11-03",
        end_date: "2026-11-04",
        request_type: "vacation",
        business_days: 2,
      },
    ],
  },
  epr: {
    year: 2026,
    goal_count: 5,
    goal_setting_done: true,
    mid_year_done: false,
    final_review_done: false,
    next_stage: "mid_year",
  },
  governance: {
    open_pip: true,
    pip_status: "active",
    open_idle_flags: 2,
    open_absences: 1,
    pending_promotion: false,
  },
  meetings: { last_one_on_one_on: "2026-10-01" },
};

const OTHER: TeamMemberSummary = {
  ...MEMBER,
  id: 8,
  full_name: "Ilir Gjoka",
  username: "ilir",
  email: "ilir@example.com",
  seniority_level: null,
  wage: { gross_monthly: null, effective_from: null, status: "missing" },
  epr: {
    ...MEMBER.epr,
    goal_setting_done: false,
    mid_year_done: false,
    next_stage: "goal_setting",
  },
  governance: {
    open_pip: false,
    pip_status: null,
    open_idle_flags: 0,
    open_absences: 0,
    pending_promotion: true,
  },
};

const renderTab = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TeamTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("TeamTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // DataTable measures its container; jsdom has no ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    (tlScorecardService.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [MEMBER, OTHER],
    });
  });

  it("renders one row per team member and the real team stats", async () => {
    renderTab();

    expect(await screen.findByText("Bora Zeta")).toBeInTheDocument();
    expect(screen.getByText("Ilir Gjoka")).toBeInTheDocument();
    // Members, open PIPs (1), open absences (1), EPR goal-setting done (1/2).
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getAllByText("PIP").length).toBeGreaterThan(0);
  });

  it("shows governance badges and the missing-wage dash with a reason", async () => {
    renderTab();
    await screen.findByText("Bora Zeta");

    const row = screen.getByText("Bora Zeta").closest("tr") as HTMLElement;
    expect(within(row).getByText("Idle x 2")).toBeInTheDocument();
    expect(within(row).getByText("Absence x 1")).toBeInTheDocument();

    const otherRow = screen.getByText("Ilir Gjoka").closest("tr") as HTMLElement;
    expect(within(otherRow).getByText("Promotion")).toBeInTheDocument();
    expect(within(otherRow).getByTitle("No wage for this month")).toBeInTheDocument();
  });

  it("opens the member detail panel from the row with wage, leave and EPR values", async () => {
    renderTab();
    await screen.findByText("Bora Zeta");

    // The single Eye action duplicated row click, so the Actions column was
    // removed — the row itself (mouse and keyboard) opens the panel.
    const row = screen.getByText("Bora Zeta").closest("tr") as HTMLElement;
    fireEvent.click(row);

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Compensation")).toBeInTheDocument();
    // Intl puts a non-breaking space between digit groups; match any whitespace.
    expect(within(panel).getByText(/150\s000\sLek/)).toBeInTheDocument();
    expect(within(panel).getByText("13 d")).toBeInTheDocument();
    expect(within(panel).getByText("Goal setting")).toBeInTheDocument();
    expect(within(panel).getByText("Mid-year")).toBeInTheDocument();
    expect(within(panel).getByText("2 business days")).toBeInTheDocument();
  });

  it("opening the panel fires no extra request", async () => {
    renderTab();
    await screen.findByText("Bora Zeta");

    const row = screen.getByText("Bora Zeta").closest("tr") as HTMLElement;
    fireEvent.keyDown(row, { key: "Enter" });
    await screen.findByRole("dialog");

    expect(tlScorecardService.getTeamMembers).toHaveBeenCalledTimes(1);
  });

  it("never shows a Restricted placeholder", async () => {
    renderTab();
    await screen.findByText("Bora Zeta");
    const row = screen.getByText("Bora Zeta").closest("tr") as HTMLElement;
    fireEvent.click(row);
    await screen.findByRole("dialog");

    expect(screen.queryByText(/restricted/i)).not.toBeInTheDocument();
  });

  it("shows an empty state when the team has no members", async () => {
    (tlScorecardService.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    renderTab();

    expect(await screen.findByText("No team members yet")).toBeInTheDocument();
  });

  it("shows a retryable error when the team cannot load", async () => {
    (tlScorecardService.getTeamMembers as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom")
    );
    renderTab();

    await waitFor(() => expect(screen.getByText("Couldn't load your team")).toBeInTheDocument());
  });
});
