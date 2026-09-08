/** Pure helpers for the custom chart viewer — extracted for testability
 *  and to satisfy react-refresh/only-export-components. */
import type { OrgChartNode, OrgChartEdge } from "../types";

/** Check if a node matches the search query (case-insensitive). */
export function nodeMatches(node: OrgChartNode, query: string): boolean {
  const q = query.toLowerCase();
  return (
    node.display_name.toLowerCase().includes(q) ||
    (node.role_title ?? "").toLowerCase().includes(q) ||
    (node.department_label ?? "").toLowerCase().includes(q) ||
    (node.subtitle ?? "").toLowerCase().includes(q)
  );
}

/**
 * Filter the hierarchy to matching nodes + their ancestors.
 * Returns the pruned node list and the set of matching + ancestor UUIDs.
 * Mirrors the live chart's filterTree behavior for parity.
 */
export function filterHierarchy(
  nodes: OrgChartNode[],
  edges: OrgChartEdge[],
  query: string
): { filteredNodes: OrgChartNode[]; visibleIds: Set<string> } {
  const q = query.toLowerCase().trim();
  if (!q) return { filteredNodes: nodes, visibleIds: new Set(nodes.map((n) => n.node_uuid)) };

  // Explicit hierarchy edges take precedence over visual group membership.
  const parentMap = new Map<string, string>();
  const nodeIds = new Set(nodes.map((node) => node.node_uuid));
  for (const e of edges) {
    if (e.edge_type === "reports_to" || e.edge_type === "contains") {
      if (!parentMap.has(e.target_uuid)) {
        parentMap.set(e.target_uuid, e.source_uuid);
      }
    }
  }
  for (const node of nodes) {
    if (!parentMap.has(node.node_uuid) && node.group_uuid && nodeIds.has(node.group_uuid)) {
      parentMap.set(node.node_uuid, node.group_uuid);
    }
  }

  const matchIds = new Set<string>();
  for (const n of nodes) {
    if (nodeMatches(n, q)) matchIds.add(n.node_uuid);
  }

  // Preserve ancestors of matches
  const visibleIds = new Set<string>(matchIds);
  for (const id of matchIds) {
    let current = parentMap.get(id);
    while (current && !visibleIds.has(current)) {
      visibleIds.add(current);
      current = parentMap.get(current);
    }
  }

  const filteredNodes = nodes.filter((n) => visibleIds.has(n.node_uuid));
  return { filteredNodes, visibleIds };
}
