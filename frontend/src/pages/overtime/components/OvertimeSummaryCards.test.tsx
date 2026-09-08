import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OvertimeSummaryCards } from "./OvertimeSummaryCards";

describe("OvertimeSummaryCards", () => {
  it("renders all five summary stats with tabular-nums values", () => {
    const { container } = render(
      <OvertimeSummaryCards
        summary={{
          total_hours: 42,
          total_entries: 7,
          approved_hours: 30,
          pending_hours: 10,
          rejected_hours: 2,
        }}
      />
    );

    for (const label of [
      "TOTAL HOURS",
      "TOTAL ENTRIES",
      "APPROVED HOURS",
      "PENDING HOURS",
      "REJECTED HOURS",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // Converged on the shared ui/StatCard: values use tabular-nums.
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(5);

    // The older dashboard/StatCard variant rendered icons inside
    // bg-gradient-to-br boxes — the shared ui/StatCard does not.
    expect(container.querySelector(".bg-gradient-to-br")).toBeNull();
  });

  it("renders nothing when summary is missing", () => {
    const { container } = render(<OvertimeSummaryCards summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders no progress bars for the Employee-flavored card (default)", () => {
    const { container } = render(
      <OvertimeSummaryCards
        summary={{
          total_hours: 40,
          total_entries: 8,
          approved_hours: 30,
          pending_hours: 8,
          rejected_hours: 2,
        }}
      />
    );

    expect(container.querySelectorAll('[data-testid="stat-card-progress-fill"]')).toHaveLength(0);
  });

  it("renders TL-flavored progress bars with mockup-matching ratios when isTeamLeader", () => {
    const { container } = render(
      <OvertimeSummaryCards
        isTeamLeader
        summary={{
          total_hours: 40,
          total_entries: 8,
          approved_hours: 30,
          pending_hours: 8,
          rejected_hours: 2,
        }}
      />
    );

    const fills = container.querySelectorAll('[data-testid="stat-card-progress-fill"]');
    expect(fills).toHaveLength(5);
    expect((fills[2] as HTMLElement).style.width).toBe("75%"); // approved_hours / total_hours
    expect((fills[3] as HTMLElement).style.width).toBe("20%"); // pending_hours / total_hours
    expect((fills[4] as HTMLElement).style.width).toBe("5%"); // rejected_hours / total_hours
  });
});
