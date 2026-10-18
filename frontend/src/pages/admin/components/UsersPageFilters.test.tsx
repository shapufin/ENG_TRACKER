import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UsersPageFilters } from "./UsersPageFilters";

const makeState = (over: Record<string, unknown> = {}) => ({
  tlFilter: "employee",
  setTlFilter: vi.fn(),
  techFacets: [],
  noTechCount: 0,
  techIds: [],
  setTechIds: vi.fn(),
  techLevelIds: [],
  setTechLevelIds: vi.fn(),
  noTechOnly: false,
  setNoTechOnly: vi.fn(),
  teamIds: [],
  setTeamIds: vi.fn(),
  crActive: true,
  crOnly: false,
  setCrOnly: vi.fn(),
  profilesCount: 12,
  filteredData: [],
  ...over,
});

const renderFilters = (over: Record<string, unknown> = {}) => {
  const state = makeState(over);
  render(<UsersPageFilters state={state as never} teams={[]} />);
  return state;
};

describe("UsersPageFilters active strip", () => {
  it("shows no strip when nothing narrows the list", () => {
    renderFilters();
    expect(screen.queryByText("Active:")).toBeNull();
  });

  it("counts CR-only as an active filter, reports the server total, and Clear all resets it", () => {
    const state = renderFilters({ crOnly: true, profilesCount: 3 });
    expect(screen.getByText("Active:")).toBeInTheDocument();
    expect(screen.getByText("CR only")).toBeInTheDocument();
    expect(screen.getByText(/3 users match/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(state.setCrOnly).toHaveBeenCalledWith(false);
    expect(state.setTlFilter).toHaveBeenCalledWith("employee");
  });

  it("uses the singular for exactly one match", () => {
    renderFilters({ tlFilter: "hr", profilesCount: 1 });
    expect(screen.getByText(/1 user matches/)).toBeInTheDocument();
    expect(screen.queryByText(/1 users match/)).toBeNull();
  });
});

describe("UsersPageFilters layout", () => {
  const renderWithFacets = () => {
    const state = makeState({
      techFacets: [{ id: 1, name: "Infra", code: "INF", count: 4, levels: [], no_level_count: 0 }],
      noTechCount: 2,
    });
    render(
      <UsersPageFilters state={state as never} teams={[{ id: 7, name: "Alpha Team" }] as never} />
    );
  };

  it("labels the role row once", () => {
    renderWithFacets();
    expect(screen.getAllByText("Role")).toHaveLength(1);
  });

  it("renders the inline Team filter chip row and toggles team selection", () => {
    const state = makeState({
      techFacets: [{ id: 1, name: "Infra", code: "INF", count: 4, levels: [], no_level_count: 0 }],
      noTechCount: 2,
    });
    render(
      <UsersPageFilters state={state as never} teams={[{ id: 7, name: "Alpha Team" }] as never} />
    );
    expect(screen.getByRole("group", { name: "Tech" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Team" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alpha Team" }));
    expect(state.setTeamIds).toHaveBeenCalledWith([7]);
  });
});
