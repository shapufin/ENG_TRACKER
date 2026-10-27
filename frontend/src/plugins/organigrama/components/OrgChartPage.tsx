/** Interactive org chart using React Flow + Dagre layout with 3D perspective mode and export. */
import React, { useMemo, useState, useCallback, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import type { TreeNode } from "../types";
import { OrgNode, type OrgNodeData } from "./OrgNode";
import { OrgChartToolbar } from "./OrgChartToolbar";
import { exportCanvasToPng } from "./viewerHelpers";
import { cn } from "@/lib/utils";

const nodeTypes: NodeTypes = { orgNode: OrgNode };

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;

/** Check if a node matches the search query (case-insensitive). */
function nodeMatches(node: TreeNode, q: string): boolean {
  const name = node.type === "person" ? node.full_name || node.username || "" : node.name || "";
  const code = node.code || "";
  return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
}

/** Filter tree to matching nodes + their ancestors. Returns pruned tree + set of matching IDs. */
function filterTree(roots: TreeNode[], q: string): { filtered: TreeNode[]; matchIds: Set<string> } {
  const matchIds = new Set<string>();

  function visit(node: TreeNode, ancestors: TreeNode[]): TreeNode | null {
    const nodeId = `${node.type}-${node.id}`;
    const matches = nodeMatches(node, q);
    const filteredChildren: TreeNode[] = [];

    for (const child of node.children) {
      const result = visit(child, [...ancestors, node]);
      if (result) filteredChildren.push(result);
    }

    if (matches) {
      matchIds.add(nodeId);
      for (const a of ancestors) {
        matchIds.add(`${a.type}-${a.id}`);
      }
      return { ...node, children: filteredChildren };
    }

    if (filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }

    return null;
  }

  const filtered: TreeNode[] = [];
  for (const root of roots) {
    const result = visit(root, []);
    if (result) filtered.push(result);
  }

  return { filtered, matchIds };
}

/** Recursively collect all path-scoped node IDs that have children. */
function getAllParentNodeIds(roots: TreeNode[]): Set<string> {
  const result = new Set<string>();
  function collect(node: TreeNode, parentId?: string) {
    const rawId = `${node.type}-${node.id}`;
    const nodeId = parentId ? `${parentId}__${rawId}` : rawId;
    if (node.children.length > 0) {
      result.add(nodeId);
      for (const child of node.children) {
        collect(child, nodeId);
      }
    }
  }
  for (const root of roots) {
    collect(root);
  }
  return result;
}

/** Build a Dagre graph from the tree and return positioned nodes + edges.
 *  Collapsed nodes have their children excluded from the layout.
 *  Matching nodes (by search query) are highlighted. */
function layoutTree(
  roots: TreeNode[],
  collapsed: Set<string>,
  searchQuery: string
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes: Node<OrgNodeData>[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>();
  const q = searchQuery.toLowerCase().trim();

  function visit(node: TreeNode, parentId?: string) {
    const rawId = `${node.type}-${node.id}`;
    // Scope node ID to parent branch path so repeated nodes (e.g. bridging AL TLs or tech nodes)
    // receive unique node IDs and separate layouts in the Dagre tree.
    const nodeId = parentId ? `${parentId}__${rawId}` : rawId;
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const isCollapsed = collapsed.has(nodeId);
    const hasChildren = node.children.length > 0;
    const label =
      node.type === "person" ? node.full_name || node.username || "Unknown" : node.name || "Tech";
    const subtitle = node.type === "tech" ? node.code : undefined;
    const roleBadge = node.type === "person" ? node.role_badge : undefined;
    const techLevels = node.type === "person" ? node.tech_levels : undefined;
    const highlighted = q.length > 0 && nodeMatches(node, q);

    nodes.push({
      id: nodeId,
      type: "orgNode",
      position: { x: 0, y: 0 },
      data: {
        nodeType: node.type,
        label,
        subtitle,
        roleBadge,
        techLevels,
        hasChildren,
        collapsed: isCollapsed,
        highlighted,
      },
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "step",
      });
    }

    if (!isCollapsed) {
      for (const child of node.children) {
        visit(child, nodeId);
      }
    }
  }

  for (const root of roots) {
    visit(root);
  }

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      node.position = {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      };
    }
  }

  return { nodes, edges };
}

export interface OrgChartPageProps {
  roots: TreeNode[];
  isLandscape?: boolean;
  isMobile?: boolean;
  onSwitchToList?: () => void;
}

const OrgChartInner: React.FC<OrgChartPageProps> = ({
  roots,
  isLandscape,
  isMobile,
  onSwitchToList,
}) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [is3D, setIs3D] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const reactFlow = useReactFlow();

  // Filter tree based on search
  const filteredRoots = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return roots;
    const { filtered } = filterTree(roots, q);
    return filtered;
  }, [roots, searchQuery]);

  // Build layout with collapse state + search highlighting
  const { nodes, edges } = useMemo(
    () => layoutTree(filteredRoots, collapsedNodes, searchQuery),
    [filteredRoots, collapsedNodes, searchQuery]
  );

  const defaultEdgeOptions = useMemo(() => ({ type: "step" }), []);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    const nodeId = node.id;
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setCollapsedNodes(new Set());
  }, []);

  const handleCollapseAll = useCallback(() => {
    setCollapsedNodes(getAllParentNodeIds(filteredRoots));
  }, [filteredRoots]);

  const handleZoomIn = useCallback(() => reactFlow.zoomIn(), [reactFlow]);
  const handleZoomOut = useCallback(() => reactFlow.zoomOut(), [reactFlow]);
  const handleFitView = useCallback(() => reactFlow.fitView({ padding: 0.2 }), [reactFlow]);

  const handleExportPng = useCallback(async () => {
    const success = await exportCanvasToPng(canvasRef.current, "company-organigrama.png");
    if (!success) {
      alert("Failed to export image.");
    }
  }, []);

  return (
    <div className="space-y-2" aria-label="Organizational chart">
      <OrgChartToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        is3D={is3D}
        onToggle3D={() => setIs3D((prev) => !prev)}
        onExportPng={handleExportPng}
        onSwitchToList={onSwitchToList}
      />
      <div
        ref={canvasRef}
        className={cn(
          "w-full overflow-hidden rounded-lg border [perspective:1400px]",
          isLandscape
            ? "h-[calc(100dvh-5.5rem)]"
            : isMobile
              ? "h-[calc(100dvh-10rem)]"
              : "h-[calc(100vh-16rem)]"
        )}
      >
        <div
          className="h-full w-full transition-transform duration-500 ease-out"
          style={{
            transform: is3D ? "rotateX(22deg) rotateZ(-3deg) scale(0.92)" : "none",
            transformStyle: "preserve-3d",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            onNodeClick={onNodeClick}
            panOnDrag={true}
            zoomOnPinch={true}
            preventScrolling={false}
            fitView
            fitViewOptions={{ padding: isMobile ? 0.08 : 0.15, minZoom: 0.1, maxZoom: 1.5 }}
            attributionPosition="bottom-left"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};

export const OrgChartPage: React.FC<OrgChartPageProps> = (props) => {
  return (
    <ReactFlowProvider>
      <OrgChartInner {...props} />
    </ReactFlowProvider>
  );
};
