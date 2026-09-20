import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TLStatsCards } from "./TLStatsCards";

describe("TLStatsCards modernization", () => {
  const renderCards = () =>
    render(
      <TLStatsCards
        pendingTotal={4}
        pendingOvertime={2}
        pendingStandby={1}
        pendingLeave={1}
        approvedCount={7}
      />
    );

  it("renders the five stat labels", () => {
    const { getByText } = renderCards();
    [
      "Pending Approvals",
      "Pending Standby",
      "Pending Leave",
      "Pending Overtime",
      "Approved MTD",
    ].forEach((label) => expect(getByText(label)).toBeInTheDocument());
  });

  it("renders values with tabular-nums", () => {
    const { getByText } = renderCards();
    expect(getByText("4").className).toContain("tabular-nums");
  });

  it("renders a footer strip on every card with real computed values", () => {
    const { container, getByText, getAllByText } = renderCards();
    const footers = container.querySelectorAll('[data-testid="stat-card-footer"]');
    expect(footers).toHaveLength(5);
    expect(getByText("Requires your action")).toBeInTheDocument();
    expect(getAllByText("25% queue mix")).toHaveLength(2);
    expect(getByText("50% queue mix")).toBeInTheDocument();
    expect(getByText("64% of all requests")).toBeInTheDocument();
    expect(getByText("On-call shifts")).toBeInTheDocument();
    expect(getByText("Planned absence")).toBeInTheDocument();
    expect(getByText("Extra capacity")).toBeInTheDocument();
  });

  it("shows team context in the approvals footer when team size is known", () => {
    const { getByText } = render(
      <TLStatsCards
        pendingTotal={4}
        pendingOvertime={2}
        pendingStandby={1}
        pendingLeave={1}
        approvedCount={7}
        teamSize={27}
        activeOperatorCount={25}
      />
    );
    expect(getByText("Requires your action")).toBeInTheDocument();
    expect(getByText("25 of 27 active")).toBeInTheDocument();
  });

  it("shows a clear state when the queue is empty", () => {
    const { getByText } = render(
      <TLStatsCards
        pendingTotal={0}
        pendingOvertime={0}
        pendingStandby={0}
        pendingLeave={0}
        approvedCount={7}
      />
    );
    expect(getByText("Queue clear")).toBeInTheDocument();
  });

  it("does not duplicate the Approved MTD footer text when there are zero approved and pending requests", () => {
    const { getAllByText } = render(
      <TLStatsCards
        pendingTotal={0}
        pendingOvertime={0}
        pendingStandby={0}
        pendingLeave={0}
        approvedCount={0}
      />
    );
    expect(getAllByText("Recently approved")).toHaveLength(1);
  });

  it("does not use raw gradient overlays or inline glass imitations", () => {
    const { container } = renderCards();
    expect(container.innerHTML).not.toContain("bg-gradient-to-br");
    expect(container.innerHTML).not.toContain("bg-card/50");
    expect(container.innerHTML).not.toContain("text-muted-foreground/60");
  });

  it("renders mockup-matching progress bars on every card (TL-only component)", () => {
    const { container } = renderCards();
    const fills = container.querySelectorAll('[data-testid="stat-card-progress-fill"]');
    expect(fills).toHaveLength(5);
    expect((fills[1] as HTMLElement).style.width).toBe("25%"); // pendingStandby / pendingTotal
    expect((fills[2] as HTMLElement).style.width).toBe("25%"); // pendingLeave / pendingTotal
    expect((fills[3] as HTMLElement).style.width).toBe("50%"); // pendingOvertime / pendingTotal
    expect((fills[4] as HTMLElement).style.width).toBe("64%"); // approvedCount / (approvedCount + pendingTotal)
  });

  // Per-type tinted icon wells: break up the monochrome row when all counts
  // are zero (each card gets a faint accent tint behind its icon).
  it("gives every card a distinct tinted icon well", () => {
    const { container } = renderCards();
    const wells = [...container.querySelectorAll('div[class*="bg-accent-"]')];
    expect(wells).toHaveLength(5);
    const classes = wells.map((w) => w.className);
    expect(classes[0]).toContain("bg-accent-red/10");
    expect(classes[1]).toContain("bg-accent-yellow/10");
    expect(classes[2]).toContain("bg-accent-violet/10");
    expect(classes[3]).toContain("bg-accent-orange/10");
    expect(classes[4]).toContain("bg-accent-emerald/10");
  });
});
