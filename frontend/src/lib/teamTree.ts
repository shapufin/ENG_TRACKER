import type { Team } from "@/types";

export interface TeamNode extends Team {
  depth: number;
  children: TeamNode[];
}

export const buildTeamTree = (teams: Team[]): TeamNode[] => {
  const map = new Map<number, TeamNode>();
  teams.forEach((t) => map.set(t.id, { ...t, depth: 0, children: [] }));
  const roots: TeamNode[] = [];
  teams.forEach((t) => {
    const node = map.get(t.id)!;
    if (t.parent_team && map.has(t.parent_team)) {
      const parent = map.get(t.parent_team)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};

export const flattenTree = (nodes: TeamNode[]): TeamNode[] => {
  const result: TeamNode[] = [];
  function walk(list: TeamNode[]) {
    list.forEach((n) => {
      result.push(n);
      walk(n.children);
    });
  }
  walk(nodes);
  return result;
};

export const getVisibleNodes = (nodes: TeamNode[], expanded: Set<number>): TeamNode[] => {
  const result: TeamNode[] = [];
  function walk(list: TeamNode[]) {
    list.forEach((n) => {
      result.push(n);
      if (expanded.has(n.id)) walk(n.children);
    });
  }
  walk(nodes);
  return result;
};

export const getHierarchyPath = (teamId: number, nodes: TeamNode[]): number[] => {
  const path: number[] = [];
  let current = nodes.find((t) => t.id === teamId);
  while (current) {
    path.push(current.id);
    const parentId = current.parent_team;
    current = parentId != null ? nodes.find((t) => t.id === parentId) : undefined;
  }
  return path;
};
