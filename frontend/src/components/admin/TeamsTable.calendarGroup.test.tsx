import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamsTable } from "./TeamsTable";

const teams = [
  { id: 1, name: "Alpha", code: "A", calendar_group: "pod-a", members_count: 3, team_leader: null },
  { id: 2, name: "Beta", code: "B", calendar_group: "", members_count: 2, team_leader: null },
] as any;

const baseProps = {
  teams,
  selectedTeams: new Set<number>(),
  onSelectionChange: vi.fn(),
  onEditTeam: vi.fn(),
  searchQuery: "",
  onSearchChange: vi.fn(),
};

describe("TeamsTable calendar-group controls", () => {
  it("shows only ungrouped teams when the Ungrouped status is set", () => {
    render(<TeamsTable {...baseProps} statusFilter="ungrouped" />);
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("shows only the teams of the selected calendar group", () => {
    render(<TeamsTable {...baseProps} groupFilter="pod-a" />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).toBeNull();
  });

  it("routes the row remove action to the page instead of unlinking directly", () => {
    const onUnlinkTeam = vi.fn();
    render(<TeamsTable {...baseProps} onUnlinkTeam={onUnlinkTeam} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Alpha from pod-a" }));
    expect(onUnlinkTeam).toHaveBeenCalledWith(teams[0]);
  });
});
