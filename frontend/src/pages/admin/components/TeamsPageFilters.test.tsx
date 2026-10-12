import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamsPageFilters } from "./TeamsPageFilters";

describe("TeamsPageFilters", () => {
  it("toggles the leader filter when a chip is clicked", () => {
    const onLeaderFilter = vi.fn();
    render(
      <TeamsPageFilters
        leaderFilter="all"
        onLeaderFilterChange={onLeaderFilter}
        groups={["msc_siae"]}
        groupFilter="all"
        onGroupFilterChange={vi.fn()}
        counts={{ all: 5, withLeader: 2, noLeader: 3 }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /no leader/i }));
    expect(onLeaderFilter).toHaveBeenCalledWith("no-leader");
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
        counts={{ all: 5, withLeader: 2, noLeader: 3 }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /msc_siae/i }));
    expect(onGroupFilter).toHaveBeenCalledWith("msc_siae");
  });
});
