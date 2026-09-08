import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserStatsCards } from "./UserStatsCards";

describe("UserStatsCards", () => {
  it("renders the five user stats with tabular-nums values on the shared StatCard", () => {
    const { container } = render(
      <UserStatsCards
        stats={{
          total_users: 12,
          italian_tl_count: 3,
          albanian_tl_count: 2,
          no_tl_count: 1,
          active_today_count: 9,
        }}
      />
    );

    for (const label of ["Total Users", "Italian TL", "Albanian TL", "No TL", "Active Today"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // Converged on the shared ui/StatCard: values use tabular-nums and the
    // old gradient + bg-black/30 icon-box surface is gone.
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(5);
    expect(container.querySelector(".bg-gradient-to-br")).toBeNull();
    expect(container.querySelector('[class*="bg-black"]')).toBeNull();
  });
});
