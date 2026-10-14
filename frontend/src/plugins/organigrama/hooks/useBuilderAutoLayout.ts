/** Auto-layout calculation for Organigrama builder canvas using Dagre. */
import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import { nodeWidth, nodeHeight, orderNodesParentFirst } from "../pages/groupHelpers";

export type LayoutDirection = "TB" | "LR";

interface LayoutOptions {
  direction?: LayoutDirection;
  nodeSep?: number;
  rankSep?: number;
}

/** Compute new positions for nodes using Dagre hierarchical tree layout. */
export function calculateHierarchyLayout(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  if (nodes.length === 0) return nodes;

  const { direction = "TB", nodeSep = 50, rankSep = 80 } = options;
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSep,
    ranksep: rankSep,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Separate non-container nodes and container nodes.
  // We only pass top-level nodes or non-container nodes to Dagre layout.
  // Nodes with a parentId (inside a group) stay relative to their container.
  const topLevelNodes = nodes.filter((n) => !n.parentId);
  const groupedNodes = nodes.filter((n) => Boolean(n.parentId));

  for (const node of topLevelNodes) {
    const w = nodeWidth(node);
    const h = nodeHeight(node);
    g.setNode(node.id, { width: w, height: h });
  }

  // Add edges between top-level nodes to dagre
  const topLevelIds = new Set(topLevelNodes.map((n) => n.id));
  for (const edge of edges) {
    if (topLevelIds.has(edge.source) && topLevelIds.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const updatedTopLevel = topLevelNodes.map((node) => {
    const positioned = g.node(node.id);
    if (!positioned) return node;

    const w = nodeWidth(node);
    const h = nodeHeight(node);
    return {
      ...node,
      position: {
        x: Math.round(positioned.x - w / 2),
        y: Math.round(positioned.y - h / 2),
      },
    };
  });

  // Re-combine and preserve parent-first ordering
  return orderNodesParentFirst([...updatedTopLevel, ...groupedNodes]);
}

/** Calculate initial spawn position for a direct report beneath a parent node. */
export function calculateChildSpawnPosition(
  parentNode: Node,
  existingChildrenCount: number,
  childWidth = 200
): { x: number; y: number } {
  const pWidth = nodeWidth(parentNode);
  const pHeight = nodeHeight(parentNode);

  // Offset children horizontally if multiple reports exist
  const horizontalOffset = (existingChildrenCount - 1) * (childWidth + 30);
  return {
    x: parentNode.position.x + (pWidth - childWidth) / 2 + horizontalOffset,
    y: parentNode.position.y + pHeight + 80,
  };
}
