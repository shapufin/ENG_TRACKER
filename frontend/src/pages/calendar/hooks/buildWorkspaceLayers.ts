import type { CalendarSidebarLayer } from "@/components/calendar/CalendarSidebarLayers";
import type { CalendarWorkspace } from "@/types";

/**
 * Workspace names and codes are unique, but the layer label prefers the linked team's name and
 * several workspaces can point at one team (or a team can be named like another workspace). When
 * labels collide, qualify each with the workspace's own name (or code if that is the label).
 */
export function buildWorkspaceLayers(
  workspaces: readonly CalendarWorkspace[],
  countByWorkspace: ReadonlyMap<number, number>,
  activeIds: readonly number[]
): CalendarSidebarLayer[] {
  const labelCounts = new Map<string, number>();
  workspaces.forEach((w) => {
    const label = w.team_name || w.name;
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  });
  return workspaces.map((workspace) => {
    const label = workspace.team_name || workspace.name;
    const qualifier = workspace.name === label ? workspace.code : workspace.name;
    return {
      id: workspace.id,
      name: (labelCounts.get(label) ?? 0) > 1 ? `${label} (${qualifier})` : label,
      code: workspace.team_code || workspace.code,
      count: countByWorkspace.get(workspace.id),
      active: activeIds.includes(workspace.id),
    };
  });
}
