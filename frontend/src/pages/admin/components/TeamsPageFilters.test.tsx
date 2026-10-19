import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamsPageFilters } from "./TeamsPageFilters";

const COUNTS = { all: 5, complete: 2, missingIt: 1, missingAl: 3, incomplete: 3 };

describe("TeamsPageFilters", () => {
  it("toggles the TL filter when a chip is clicked", () => {
    const onLeaderFilter = vi.fn();
    render(
      <TeamsPageFilters
        leaderFilter="all"
        onLeaderFilterChange={onLeaderFilter}
        groups={["msc_siae"]}
        groupFilter="all"
        onGroupFilterChange={vi.fn()}
        counts={COUNTS}
        onReset={vi.fn()}
        hasActiveFilters={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /missing al/i }));
    expect(onLeaderFilter).toHaveBeenCalledWith("missing-al");
  });

  it("toggles the calendar-group filter when a chip is clicked", () => {
    const onGroupFilter = vi.fn();
    render(
      <TeamsPageFilters
        leaderFilter="all"
        onLeaderFilterChange={vi.fn()}
        groups={["msc_siae"]}
        groupFilter="all"
        onGroupFilterChange={onGroupFilter}
        counts={COUNTS}
        onReset={vi.fn()}
        hasActiveFilters={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /msc_siae/i }));
    expect(onGroupFilter).toHaveBeenCalledWith("msc_siae");
  });

  it("offers Clear all only while a filter is active", () => {
    const onReset = vi.fn();
    const props = {
      leaderFilter: "complete" as const,
      onLeaderFilterChange: vi.fn(),
      groups: [],
      groupFilter: "all",
      onGroupFilterChange: vi.fn(),
      counts: COUNTS,
      onReset,
    };
    const { rerender } = render(<TeamsPageFilters {...props} hasActiveFilters />);
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(onReset).toHaveBeenCalled();
    rerender(<TeamsPageFilters {...props} hasActiveFilters={false} />);
    expect(screen.queryByRole("button", { name: /clear all/i })).toBeNull();
  });
});
