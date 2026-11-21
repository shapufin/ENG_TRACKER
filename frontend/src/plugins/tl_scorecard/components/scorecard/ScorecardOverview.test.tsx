import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { ScorecardOverview } from "./ScorecardOverview";
import type { Scorecard } from "../../types/tlScorecard";

const BASE_SCORECARD: Scorecard = {
  month: "2026-10-01",
  team_size: 5,
  leave: {
    decided_count: 5,
    within_2_days: 5,
    pct_within_2_days: 100,
    pending_at_month_end: 0,
  },
  overtime: {
    decided_count: 3,
    within_sla: 2,
    pct_within_sla: 66.7,
    avg_turnaround_days: 1.7,
  },
  meetings: {
    one_on_one_compliance_pct: 100,
    one_on_one_compliant: 5,
    one_on_one_eligible: 5,
    tl_sync_count: 2,
    team_meetings_held: 1,
    team_meetings_with_hrbp: 1,
    team_meeting_notes_within_24h: 1,
  },
  idle: { open_count: 0, resolved_count: 0 },
  review_deliveries_ytd: 10,
  seniority: { junior: 1, mid: 2, senior: 2, unset: 0 },
  absences: { open_count: 0, breached_5_day_sla: 0 },
  pip: { active_count: 0, pending_approval_count: 0 },
  promotion: { promoted_count: 0, team_size: 5, promoted_pct: 0, target_pct: 3 },
  escalation_count: 0,
};

const renderOverview = (scorecard: Scorecard) => {
  return render(
    <MemoryRouter>
      <ScorecardOverview scorecard={scorecard} engagement={undefined} survey={undefined} />
    </MemoryRouter>
  );
};

describe("ScorecardOverview (Overtime SLA card)", () => {
  it("renders 66.7% and '2 of 3 decided in time · average 1.7d' when decisions exist", () => {
    renderOverview(BASE_SCORECARD);
    expect(screen.getByText("Overtime decided within 2 working days")).toBeInTheDocument();
    expect(screen.getByText("66.7%")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 decided in time · average 1.7d")).toBeInTheDocument();
  });

  it("renders the no-data dash and 'No decisions yet this month' when pct_within_sla is null", () => {
    const scorecard: Scorecard = {
      ...BASE_SCORECARD,
      overtime: {
        decided_count: 0,
        within_sla: 0,
        pct_within_sla: null,
        avg_turnaround_days: null,
      },
    };
    renderOverview(scorecard);
    expect(screen.getByText("Overtime decided within 2 working days")).toBeInTheDocument();
    expect(screen.getByText("No decisions yet this month")).toBeInTheDocument();
  });

  it("does not invent '0 of N in time' for a frozen month saved before the SLA keys existed", () => {
    const scorecard: Scorecard = {
      ...BASE_SCORECARD,
      overtime: { decided_count: 5, avg_turnaround_days: 2.4 },
    };
    renderOverview(scorecard);
    expect(screen.queryByText(/0 of 5 decided in time/)).not.toBeInTheDocument();
    expect(screen.getByText("5 requests submitted this month · average 2.4d")).toBeInTheDocument();
  });
});
