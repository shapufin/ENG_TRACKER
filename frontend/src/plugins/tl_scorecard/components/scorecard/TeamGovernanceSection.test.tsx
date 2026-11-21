import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { TeamGovernanceSection } from "./TeamGovernanceSection";
import type { Scorecard } from "../../types/tlScorecard";

const BASE_SCORECARD: Scorecard = {
  month: "2026-03-01",
  team_size: 5,
  tl_sync_ytd: 7,
  tl_sync_expected_ytd: 7,
  targets: {
    tl_sync_per_year: 26,
    tl_sync_full_year: 45,
    reviews_per_year: 12,
    one_on_one_pct: 100,
    promotion_pct: 3,
  },
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

const defaultProps = {
  escalations: [],
  pipRecords: [],
  eprCycles: [],
  canApprovePip: false,
  isApprovingPip: false,
  onApprovePip: vi.fn(),
  onParseGoals: vi.fn(),
  onCompleteStage: vi.fn(),
  onLogMeeting: vi.fn(),
  onLogReview: vi.fn(),
  onFlagIdle: vi.fn(),
  onFlagAbsence: vi.fn(),
  onNominatePromotion: vi.fn(),
  onOpenPip: vi.fn(),
  onStartEprCycle: vi.fn(),
};

const renderSection = (scorecard: Scorecard) => {
  return render(
    <MemoryRouter>
      <TeamGovernanceSection {...defaultProps} scorecard={scorecard} />
    </MemoryRouter>
  );
};

describe("TeamGovernanceSection (Manager syncs footer & pace)", () => {
  it("renders the dual target footer when tl_sync_full_year is present", () => {
    renderSection(BASE_SCORECARD);
    expect(
      screen.getByText("Target 26 (biweekly) or 45 (weekly) — either counts")
    ).toBeInTheDocument();
  });

  it("renders the fallback annual target footer when tl_sync_full_year is absent (e.g. frozen months)", () => {
    const scorecard: Scorecard = {
      ...BASE_SCORECARD,
      targets: {
        tl_sync_per_year: 26,
        reviews_per_year: 12,
        one_on_one_pct: 100,
        promotion_pct: 3,
      },
    };
    renderSection(scorecard);
    expect(screen.getByText("Annual target 26 · about 2 a month")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it("renders YTD pace trend line computed from tl_sync_per_year when on pace", () => {
    renderSection(BASE_SCORECARD);
    expect(screen.getByText("7 of 26 YTD · on pace")).toBeInTheDocument();
  });

  it("renders YTD pace trend line showing needed count when behind pace", () => {
    const scorecard: Scorecard = {
      ...BASE_SCORECARD,
      tl_sync_ytd: 5,
      tl_sync_expected_ytd: 7,
    };
    renderSection(scorecard);
    expect(screen.getByText("5 of 26 YTD · 7 needed by now")).toBeInTheDocument();
  });
});

describe("TeamGovernanceSection (Onboarding 1-on-1s card)", () => {
  it("renders the onboarding card with percentage and trend when joiners were due", () => {
    const scorecard: Scorecard = {
      ...BASE_SCORECARD,
      meetings: {
        ...BASE_SCORECARD.meetings,
        onboarding_due: 2,
        onboarding_done: 2,
        onboarding_pct: 100,
      },
    };
    renderSection(scorecard);
    expect(screen.getByText("Onboarding 1-on-1s within 14 days")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 joiners met · Target: 100%")).toBeInTheDocument();
    expect(screen.getByText("Counted in the month a joiner's 14 days end")).toBeInTheDocument();
  });

  it("renders em-dash and no joiners due when due is 0", () => {
    const scorecard: Scorecard = {
      ...BASE_SCORECARD,
      meetings: {
        ...BASE_SCORECARD.meetings,
        onboarding_due: 0,
        onboarding_done: 0,
        onboarding_pct: null,
      },
    };
    renderSection(scorecard);
    expect(screen.getByText("Onboarding 1-on-1s within 14 days")).toBeInTheDocument();
    expect(screen.getByText("No joiners due this month")).toBeInTheDocument();
  });

  it("renders em-dash and 'Not shown' when values are masked (null) for non-owner/HBPR (Review Focus 1)", () => {
    const scorecard: Scorecard = {
      ...BASE_SCORECARD,
      meetings: {
        ...BASE_SCORECARD.meetings,
        onboarding_due: null,
        onboarding_done: null,
        onboarding_pct: null,
      },
    };
    renderSection(scorecard);
    expect(screen.getByText("Onboarding 1-on-1s within 14 days")).toBeInTheDocument();
    expect(screen.getByText("Not shown")).toBeInTheDocument();
  });

  it("renders em-dash with no trend text when onboarding values are absent (undefined frozen month)", () => {
    const scorecard: Scorecard = {
      ...BASE_SCORECARD,
      meetings: {
        ...BASE_SCORECARD.meetings,
        onboarding_due: undefined,
        onboarding_done: undefined,
        onboarding_pct: undefined,
      },
    };
    renderSection(scorecard);
    expect(screen.getByText("Onboarding 1-on-1s within 14 days")).toBeInTheDocument();
    expect(screen.queryByText("Not shown")).not.toBeInTheDocument();
    expect(screen.queryByText("No joiners due this month")).not.toBeInTheDocument();
  });
});
