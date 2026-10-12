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

const TEAMS = [
  team({
    id: 1,
    name: "Alpha",
    code: "A",
    team_leader: { id: 9 } as Team["team_leader"],
    calendar_group: "g1",
  }),
  team({ id: 2, name: "Beta", code: "B", team_leader: null, calendar_group: "" }),
  team({ id: 3, name: "Gamma", code: "C", team_leader: null, calendar_group: "g1" }),
];

describe("useTeamsPageUI filters", () => {
  it("shows every team by default", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    expect(result.current.visibleData.map((t) => t.id).sort()).toEqual([1, 2, 3]);
  });

  it("narrows to leaderless teams", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    act(() => result.current.setLeaderFilter("no-leader"));
    expect(result.current.visibleData.map((t) => t.id).sort()).toEqual([2, 3]);
  });

  it("narrows to a calendar group", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    act(() => result.current.setGroupFilter("g1"));
    expect(result.current.visibleData.map((t) => t.id).sort()).toEqual([1, 3]);
  });

  it("combines both filters", () => {
    const { result } = renderHook(() => useTeamsPageUI(TEAMS));
    act(() => {
      result.current.setLeaderFilter("no-leader");
      result.current.setGroupFilter("g1");
    });
    expect(result.current.visibleData.map((t) => t.id)).toEqual([3]);
  });
});
