import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamsTable } from "./TeamsTable";
import { TEAMS_COLUMNS_STORAGE_KEY } from "./teamsColumns";
import type { Team } from "@/types";

const team: Team = {
  id: 7,
  name: "E2E Test Team",
  code: "E2E",
  description: "",
  parent_team: null,
  team_leader: null,
  calendar_group: "Ops",
  members_count: 3,
  created_at: "",
  updated_at: "",
};

const renderTable = () =>
  render(
    <TeamsTable
      teams={[team]}
      selectedTeams={new Set()}
      onSelectionChange={vi.fn()}
      onEditTeam={vi.fn()}
      searchQuery=""
      onSearchChange={vi.fn()}
    />
  );

describe("TeamsTable column visibility", () => {
  beforeEach(() => localStorage.clear());

  it("hides a toggled column from the header and every row", () => {
    renderTable();
    fireEvent.click(screen.getByText("Columns (6/6)"));
    fireEvent.click(screen.getByLabelText("Code"));

    // The only "Code" left in the DOM is the open dialog's checkbox label;
    // the header cell and every body cell for the column are gone.
    expect(screen.getAllByText("Code")).toHaveLength(1);
    expect(screen.queryByText("E2E")).not.toBeInTheDocument();
    expect(screen.getByText("Columns (5/6)")).toBeInTheDocument();
    expect(screen.getByText("E2E Test Team")).toBeInTheDocument();
  });

  it("persists the visibility map under the table-visibility key", () => {
    renderTable();
    fireEvent.click(screen.getByText("Columns (6/6)"));
    fireEvent.click(screen.getByLabelText("Leader"));

    const saved = JSON.parse(localStorage.getItem(TEAMS_COLUMNS_STORAGE_KEY)!);
    expect(saved).toMatchObject({ _version: 1, leader: false });
  });
});
