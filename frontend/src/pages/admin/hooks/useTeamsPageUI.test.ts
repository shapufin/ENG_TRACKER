import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTeamsPageUI } from "./useTeamsPageUI";
import type { Team } from "@/types";

const team = (over: Partial<Team>): Team =>
  ({
    id: 1,
    name: "T",
    code: "T",
    description: "",
    parent_team: null,
    team_leader: null,
    calendar_group: "",
    created_at: "",
    updated_at: "",
    ...over,
  }) as Team;

const TL = { id: 9, username: "x", first_name: "X", last_name: "Y" };

const TEAMS = [
  team({ id: 1, name: "Alpha", code: "A", italian_tl: TL, albanian_tl: TL, calendar_group: "g1" }),
  team({ id: 2, name: "Beta", code: "B", italian_tl: TL, albanian_tl: null, calendar_group: "" }),
  team({
    id: 3,
    name: "Gamma",
    code: "C",
    italian_tl: null,
    albanian_tl: null,
    calendar_group: "g1",
  }),
];

describe("useTeamsPageUI filters", () => {
  it("shows every team by default", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    expect(result.current.visibleData.map((t) => t.id).sort()).toEqual([1, 2, 3]);
  });

  it("narrows to teams with both TLs", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    act(() => result.current.setLeaderFilter("complete"));
    expect(result.current.visibleData.map((t) => t.id)).toEqual([1]);
  });

  it("narrows to teams missing an Italian or an Albanian TL", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    act(() => result.current.setLeaderFilter("missing-it"));
    expect(result.current.visibleData.map((t) => t.id)).toEqual([3]);
    act(() => result.current.setLeaderFilter("missing-al"));
    expect(result.current.visibleData.map((t) => t.id).sort()).toEqual([2, 3]);
  });

  it("counts each bucket and the teams missing either TL", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    expect(result.current.leaderCounts).toEqual({
      all: 3,
      complete: 1,
      missingIt: 1,
      missingAl: 2,
      incomplete: 2,
    });
  });

  it("resets every filter", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    act(() => {
      result.current.setLeaderFilter("complete");
      result.current.setGroupFilter("g1");
    });
    expect(result.current.hasActiveFilters).toBe(true);
    act(() => result.current.resetFilters());
    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.visibleData).toHaveLength(3);
  });

  it("narrows to a calendar group", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    act(() => result.current.setGroupFilter("g1"));
    expect(result.current.visibleData.map((t) => t.id).sort()).toEqual([1, 3]);
  });

  it("combines both filters", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    act(() => {
      result.current.setLeaderFilter("missing-al");
      result.current.setGroupFilter("g1");
    });
    expect(result.current.visibleData.map((t) => t.id)).toEqual([3]);
  });
});

describe("useTeamsPageUI status", () => {
  const WITH_ARCHIVED = [...TEAMS, team({ id: 4, name: "Old", code: "O", is_active: false })];

  it("hides archived teams by default and counts both groups", () => {
    const { result } = renderHook(() => useTeamsPageUI(WITH_ARCHIVED));
    expect(result.current.visibleData.map((t) => t.id).sort()).toEqual([1, 2, 3]);
    expect(result.current.statusCounts).toEqual({ active: 3, archived: 1, all: 4 });
    expect(result.current.activeTeams).toHaveLength(3);
  });

  it("shows only archived teams, or everything, on request", () => {
    const { result } = renderHook(() => useTeamsPageUI(WITH_ARCHIVED));
    act(() => result.current.setStatus("archived"));
    expect(result.current.visibleData.map((t) => t.id)).toEqual([4]);
    act(() => result.current.setStatus("all"));
    expect(result.current.visibleData).toHaveLength(4);
  });

  it("keeps the leader counts about the teams in the chosen status", () => {
    const { result } = renderHook(() => useTeamsPageUI(WITH_ARCHIVED));
    expect(result.current.leaderCounts.all).toBe(3);
    act(() => result.current.setStatus("archived"));
    expect(result.current.leaderCounts.all).toBe(1);
  });
});
