import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamFilterBar } from "./TeamFilterBar";

function renderBar() {
  return render(
    <TeamFilterBar
      searchQuery=""
      onSearchQueryChange={() => {}}
      filterStatus="all"
      onFilterStatusChange={() => {}}
      filterTeam="all"
      onFilterTeamChange={() => {}}
      dateFrom=""
      onDateFromChange={() => {}}
      dateTo=""
      onDateToChange={() => {}}
      memberGroupMode="none"
      onMemberGroupModeChange={() => {}}
      availableTeams={[]}
    />
  );
}

describe("TeamFilterBar", () => {
  it("renders on a flat non-hover-lift GlassCard", () => {
    const { container } = renderBar();

    const card = container.querySelector("[class*='shadow-glass']");
    expect(card).toBeInTheDocument();
    expect(card?.className).not.toContain("hover:-translate-y-1");
  });

  it("wraps the date-picker row on narrow screens", () => {
    const { container } = renderBar();

    const calendarIcon = container.querySelector("svg.lucide-calendar");
    const dateRow = calendarIcon?.closest("div");
    expect(dateRow?.className).toContain("flex-wrap");
  });
});
