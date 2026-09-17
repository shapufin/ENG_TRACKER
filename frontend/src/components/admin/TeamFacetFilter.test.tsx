import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeamFacetFilter } from "./TeamFacetFilter";
import type { Team } from "@/types";

const teams = [
  { id: 1, name: "Infrastructure", code: "INFRA" },
  { id: 2, name: "Database", code: "DB" },
] as Team[];

describe("TeamFacetFilter", () => {
  it("renders each team chip and the All teams chip", () => {
    render(<TeamFacetFilter teams={teams} selectedTeamIds={[]} onTeamIdsChange={vi.fn()} />);
    expect(screen.getByText("All teams")).toBeInTheDocument();
    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
  });

  it("toggling an unselected team chip adds it to the selection", () => {
    const onTeamIdsChange = vi.fn();
    render(
      <TeamFacetFilter teams={teams} selectedTeamIds={[]} onTeamIdsChange={onTeamIdsChange} />
    );
    fireEvent.click(screen.getByText("Infrastructure"));
    expect(onTeamIdsChange).toHaveBeenCalledWith([1]);
  });

  it("toggling a selected team chip removes it from the selection", () => {
    const onTeamIdsChange = vi.fn();
    render(
      <TeamFacetFilter teams={teams} selectedTeamIds={[1, 2]} onTeamIdsChange={onTeamIdsChange} />
    );
    fireEvent.click(screen.getByText("Infrastructure"));
    expect(onTeamIdsChange).toHaveBeenCalledWith([2]);
  });

  it("clicking All teams clears the selection", () => {
    const onTeamIdsChange = vi.fn();
    render(
      <TeamFacetFilter teams={teams} selectedTeamIds={[1]} onTeamIdsChange={onTeamIdsChange} />
    );
    fireEvent.click(screen.getByText("All teams"));
    expect(onTeamIdsChange).toHaveBeenCalledWith([]);
  });

  it("renders nothing when there are no teams", () => {
    const { container } = render(
      <TeamFacetFilter teams={[]} selectedTeamIds={[]} onTeamIdsChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
