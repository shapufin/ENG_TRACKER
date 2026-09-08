import { useState, useMemo, useCallback } from "react";
import { buildTeamTree, flattenTree, getVisibleNodes, getHierarchyPath } from "@/lib/teamTree";
import { toggleSetItem } from "@/lib/set-utils";
import type { Team } from "@/types";

export const useTeamsPageUI = (teams: Team[] = []) => {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [hoveredTeam, setHoveredTeam] = useState<number | null>(null);

  const allNodes = useMemo(() => flattenTree(buildTeamTree(teams)), [teams]);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => toggleSetItem(prev, id));
  }, []);

  const hoveredPath = useMemo(() => {
    if (hoveredTeam === null) return new Set<number>();
    return new Set(getHierarchyPath(hoveredTeam, allNodes));
  }, [hoveredTeam, allNodes]);

  const visibleData = useMemo(() => {
    const tree = buildTeamTree(teams);
    return getVisibleNodes(tree, expanded);
  }, [teams, expanded]);

  return {
    expanded,
    hoveredTeam,
    setHoveredTeam,
    hoveredPath,
    visibleData,
    toggleExpand,
  };
};
