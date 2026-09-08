import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsCards } from "./StatsCards";

describe("StatsCards", () => {
  it("renders the four base stats with tabular-nums values", () => {
    const { container } = render(<StatsCards total={10} pending={2} approved={7} rejected={1} />);

    for (const label of ["Total", "Pending", "Approved", "Rejected"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(4);
  });

  it("renders additional cards when provided", () => {
    render(
      <StatsCards
        total={1}
        pending={0}
        approved={1}
        rejected={0}
        additionalCards={<div>Extra Stat</div>}
      />
    );

    expect(screen.getByText("Extra Stat")).toBeInTheDocument();
  });
});
