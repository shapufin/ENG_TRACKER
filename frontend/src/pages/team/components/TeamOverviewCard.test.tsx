import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamOverviewCard } from "./TeamOverviewCard";

describe("TeamOverviewCard", () => {
  it("renders stats with tabular-nums and AA-safe status tints", () => {
    const { container } = render(
      <TeamOverviewCard
        memberCount={3}
        teamCount={2}
        vacationDaysLeft={10.5}
        overtimeHours={4.25}
        standbyHours={2.5}
      />
    );

    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.getByText("Vacation Left")).toBeInTheDocument();

    // Converged stat values: tabular-nums so digits align.
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(3);

    // No sub-AA 500-level raw tints on the stat values.
    expect(container.querySelector(".text-emerald-500")).toBeNull();
    expect(container.querySelector(".text-amber-500")).toBeNull();
    expect(container.querySelector(".text-rose-500")).toBeNull();
  });
});
