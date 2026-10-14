import type { Node, Edge } from "@xyflow/react";
import type { TreeNode, BuilderNodeData } from "../types";
import { builderEdgeProps } from "../components/builderEdgeHelpers";
import { calculateHierarchyLayout } from "../hooks/useBuilderAutoLayout";
import { newId } from "../hooks/useBuilderGraphOps";

const DEFAULT_WIDTH = 210;
const DEFAULT_HEIGHT = 88;

export function convertLiveTreeToGraph(roots: TreeNode[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>();

  function walk(node: TreeNode, parentNodeId?: string) {
    const visitKey = `${node.type}-${node.id}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    const nodeId = newId();

    const isPerson = node.type === "person";
    const displayName = isPerson
      ? node.full_name || node.username || "Employee"
      : node.name || "Tech Group";

    const roleTitle =
      isPerson && node.role_badge
        ? node.role_badge.replace("_", " ").toUpperCase()
        : isPerson
          ? "Employee"
          : "Team";

    const departmentLabel = isPerson && node.tech_levels?.length ? node.tech_levels.join(", ") : "";

    const builderData: BuilderNodeData = {
      shape_type: isPerson ? "person" : "team",
      display_name: displayName,
      role_title: roleTitle,
      department_label: departmentLabel,
      description: "",
      status: "active",
      linked_user_id: isPerson ? node.id : null,
      sort_order: 0,
      is_searchable: true,
      is_visible: true,
      style_key: "",
      custom_fields: {},
    };

    nodes.push({
      id: nodeId,
      type: "builderNode",
      position: { x: 0, y: 0 },
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      data: builderData,
    } as Node);

    if (parentNodeId) {
      edges.push({
        id: newId(),
        source: parentNodeId,
        target: nodeId,
        ...builderEdgeProps("reports_to"),
        label: "",
        data: { edge_type: "reports_to" } as Record<string, unknown>,
      });
    }

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        walk(child, nodeId);
      }
    }
  }

  for (const root of roots) {
    walk(root);
  }

  // Position nodes with Dagre auto-layout
  const layoutedNodes = calculateHierarchyLayout(nodes, edges, {
    direction: "TB",
    nodeSep: 60,
    rankSep: 90,
  });

  return { nodes: layoutedNodes, edges };
}
