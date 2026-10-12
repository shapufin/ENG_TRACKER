import { useState, useMemo, useCallback } from "react";
import { buildTeamTree, flattenTree, getVisibleNodes, getHierarchyPath } from "@/lib/teamTree";
import { toggleSetItem } from "@/lib/set-utils";
import type { Team } from "@/types";

export type TeamLeaderFilter = "all" | "with-leader" | "no-leader";

export const useTeamsPageUI = (teams: Team[] = []) => {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [hoveredTeam, setHoveredTeam] = useState<number | null>(null);
  const [leaderFilter, setLeaderFilter] = useState<TeamLeaderFilter>("all");
  const [groupFilter, setGroupFilter] = useState("all");

  const allNodes = useMemo(() => flattenTree(buildTeamTree(teams)), [teams]);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => toggleSetItem(prev, id));
  }, []);

  const hoveredPath = useMemo(() => {
    if (hoveredTeam === null) return new Set<number>();
    return new Set(getHierarchyPath(hoveredTeam, allNodes));
  }, [hoveredTeam, allNodes]);

  const filteredTeams = useMemo(
    () =>
      teams.filter((t) => {
        if (leaderFilter === "with-leader" && !t.team_leader) return false;
        if (leaderFilter === "no-leader" && t.team_leader) return false;
        if (groupFilter !== "all" && t.calendar_group !== groupFilter) return false;
        return true;
      }),
    [teams, leaderFilter, groupFilter]
  );

  const leaderCounts = useMemo(
    () => ({
      all: teams.length,
      withLeader: teams.filter((t) => t.team_leader).length,
      noLeader: teams.filter((t) => !t.team_leader).length,
    }),
    [teams]
  );

  const visibleData = useMemo(() => {
    const tree = buildTeamTree(filteredTeams);
    return getVisibleNodes(tree, expanded);
  }, [filteredTeams, expanded]);

  return {
    expanded,
    hoveredTeam,
    setHoveredTeam,
    hoveredPath,
    visibleData,
    toggleExpand,
    leaderFilter,
    setLeaderFilter,
    groupFilter,
    setGroupFilter,
    leaderCounts,
  };
};
