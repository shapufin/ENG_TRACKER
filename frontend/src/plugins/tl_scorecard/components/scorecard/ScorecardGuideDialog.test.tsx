import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ScorecardGuideDialog } from "./ScorecardGuideDialog";
import type { ScorecardTargets } from "../../types/tlScorecard";

const TARGETS: ScorecardTargets = {
  tl_sync_per_year: 26,
  tl_sync_full_year: 45,
  one_on_one_pct: 100,
  ot_within_sla_pct: 100,
  reviews_per_year: 12,
  promotion_pct: 3,
};

describe("ScorecardGuideDialog", () => {
  it("renders all scorecard measurement guide sections with target values", () => {
    render(<ScorecardGuideDialog open={true} onOpenChange={vi.fn()} targets={TARGETS} />);

    // Title & description
    expect(
      screen.getByRole("heading", { name: "How the scorecard is measured" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("What each number counts, its target, and when a month becomes final.")
    ).toBeInTheDocument();

    // Section headings & copy
    expect(screen.getByRole("heading", { name: "Leave" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Leave decided within 2 working days: target 100%. Pending leave at month-end: target 0."
      )
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Overtime" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Overtime decided within 2 working days of submission: target 100%. The average turnaround is shown for context and is not judged. Standby is not part of this target."
      )
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "1-on-1s" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "1-on-1 compliance: target 100%. A team member on approved leave for the whole month, or skipped with a reason, is excused."
      )
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Onboarding" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Onboarding 1-on-1s within 14 days: target 100%. Tick Onboarding conversation on the 1-on-1. A joiner is due 14 calendar days after their start date and counts in the month those 14 days end. A joiner who has left still counts. A month with no joiners shows —."
      )
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Manager syncs" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "26 a year (every two weeks) or 45 (weekly): either is on track. The year-to-date pace is checked against 26."
      )
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Management reviews" })).toBeInTheDocument();
    expect(screen.getByText("12 a year, one a month.")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Promotion rate" })).toBeInTheDocument();
    expect(screen.getByText("target 3%.")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Colours and status" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "The cards and the Excel and PDF reports use the same bands: a value at its target is green (On track), from 80% of it is amber (Watch), and below that red (Off track). A month with nothing to judge shows a dash."
      )
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Working days" })).toBeInTheDocument();
    expect(
      screen.getByText("Monday to Friday, excluding public holidays, in Albanian time.")
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "When a month is final" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "A month's numbers freeze at 00:00 on the 10th of the next month and do not change afterwards."
      )
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
    expect(
      screen.getByText("Your HR Business Partner never sees 1-on-1s or onboarding results.")
    ).toBeInTheDocument();
  });

  it("handles missing optional targets cleanly (frozen months fallback)", () => {
    const targetsWithoutOptionals: ScorecardTargets = {
      tl_sync_per_year: 26,
      one_on_one_pct: 100,
      reviews_per_year: 12,
      promotion_pct: 3,
    };

    render(
      <ScorecardGuideDialog open={true} onOpenChange={vi.fn()} targets={targetsWithoutOptionals} />
    );

    // Manager syncs without tl_sync_full_year drops the weekly phrase
    expect(
      screen.getByText("26 a year. The year-to-date pace is checked against 26.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/every two weeks/)).toBeNull();
    expect(screen.queryByText(/weekly/)).toBeNull();

    // Overtime without ot_within_sla_pct defaults to 100
    expect(
      screen.getByText(
        "Overtime decided within 2 working days of submission: target 100%. The average turnaround is shown for context and is not judged. Standby is not part of this target."
      )
    ).toBeInTheDocument();
  });

  it("formats numbers without trailing .0", () => {
    const targetsWithDecimals: ScorecardTargets = {
      tl_sync_per_year: 26.0,
      tl_sync_full_year: 45.0,
      one_on_one_pct: 100.0,
      ot_within_sla_pct: 100.0,
      reviews_per_year: 12.0,
      promotion_pct: 3.0,
    };

    render(
      <ScorecardGuideDialog open={true} onOpenChange={vi.fn()} targets={targetsWithDecimals} />
    );

    expect(screen.getByText("target 3%.")).toBeInTheDocument();
    expect(screen.queryByText("target 3.0%.")).toBeNull();
  });
});
