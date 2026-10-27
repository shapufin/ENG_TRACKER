import { useState, useMemo, useCallback } from "react";
import { buildTeamTree, flattenTree, getVisibleNodes, getHierarchyPath } from "@/lib/teamTree";
import { toggleSetItem } from "@/lib/set-utils";
import type { Team } from "@/types";

export type TeamLeaderFilter = "all" | "complete" | "missing-it" | "missing-al";
export type TeamStatusFilter = "active" | "archived" | "all";

const isActive = (team: Team) => team.is_active !== false;

export const useTeamsPageUI = (allTeams: Team[] = []) => {
  const [status, setStatus] = useState<TeamStatusFilter>("active");
  const statusCounts = useMemo(() => {
    const active = allTeams.filter(isActive).length;
    return { active, archived: allTeams.length - active, all: allTeams.length };
  }, [allTeams]);
  const teams = useMemo(
    () =>
      status === "all" ? allTeams : allTeams.filter((t) => isActive(t) === (status === "active")),
    [allTeams, status]
  );

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
        if (leaderFilter === "complete" && !(t.italian_tl && t.albanian_tl)) return false;
        if (leaderFilter === "missing-it" && t.italian_tl) return false;
        if (leaderFilter === "missing-al" && t.albanian_tl) return false;
        if (groupFilter !== "all" && t.calendar_group !== groupFilter) return false;
        return true;
      }),
    [teams, leaderFilter, groupFilter]
  );

  const leaderCounts = useMemo(() => {
    const complete = teams.filter((t) => t.italian_tl && t.albanian_tl).length;
    return {
      all: teams.length,
      complete,
      missingIt: teams.filter((t) => !t.italian_tl).length,
      missingAl: teams.filter((t) => !t.albanian_tl).length,
      incomplete: teams.length - complete,
    };
  }, [teams]);

  const hasActiveFilters = leaderFilter !== "all" || groupFilter !== "all";
  const resetFilters = useCallback(() => {
    setLeaderFilter("all");
    setGroupFilter("all");
  }, []);

  const visibleData = useMemo(() => {
    const tree = buildTeamTree(filteredTeams);
    return getVisibleNodes(tree, expanded);
  }, [filteredTeams, expanded]);

  return {
    status,
    setStatus,
    statusCounts,
    activeTeams: allTeams.filter(isActive),
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
    hasActiveFilters,
    resetFilters,
  };
};
